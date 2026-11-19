import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Activity,
  Archive,
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  KeyRound,
  Laptop,
  ListChecks,
  MapPin,
  MapPinned,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { api } from './api'
import type {
  AdminActivity,
  CampusLocation,
  CatalogCategory,
  ItemCategory,
  Listing,
  ListingReport,
  ListingValues,
  ManagedStudent,
  Message,
  RegistrationRequest,
  User,
} from './types'

const defaultCategoryLabels: Record<string, string> = {
  ID_CARD: 'ID cards',
  BOOKS: 'Books',
  ELECTRONICS: 'Electronics',
  KEYS: 'Keys',
  CLOTHING: 'Clothing',
  ACCESSORIES: 'Accessories',
  OTHER: 'Other',
}

function categoryLabel(category: string, categories: Pick<CatalogCategory, 'key' | 'name'>[] = []) {
  return categories.find((item) => item.key === category)?.name
    ?? defaultCategoryLabels[category]
    ?? category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(date))
}

function categoryIcon(category: ItemCategory) {
  if (category === 'BOOKS') return <BookOpen size={19} />
  if (category === 'KEYS') return <KeyRound size={19} />
  if (category === 'ELECTRONICS') return <Laptop size={19} />
  return <Tag size={19} />
}

function App() {
  return window.location.pathname.startsWith('/admin') ? <AdminApp /> : <StudentPortal />
}

function StudentPortal() {
  const [listings, setListings] = useState<Listing[]>([])
  const [catalog, setCatalog] = useState<{
    categories: Pick<CatalogCategory, 'key' | 'name'>[]
    locations: Pick<CampusLocation, 'id' | 'name'>[]
  }>({ categories: [], locations: [] })
  const [filters, setFilters] = useState({ query: '', status: '', category: '', location: '' })
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [token, setToken] = useState(() => localStorage.getItem('campus-token'))
  const [user, setUser] = useState<User | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [approvalNotice, setApprovalNotice] = useState(false)
  const [selected, setSelected] = useState<Listing | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editing, setEditing] = useState<Listing | null>(null)
  const [inboxOpen, setInboxOpen] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.listings(filters)
      .then(({ listings: results }) => {
        if (active) setListings(results)
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [filters])

  useEffect(() => {
    let active = true
    api.catalog()
      .then((result) => {
        if (active) setCatalog(result)
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!token) {
      setUser(null)
      return
    }
    api.me(token).then(({ user: currentUser }) => setUser(currentUser)).catch(() => {
      localStorage.removeItem('campus-token')
      setToken(null)
      setUser(null)
    })
  }, [token])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3500)
    return () => window.clearTimeout(timer)
  }, [notice])

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFilters((current) => ({ ...current, query: searchText.trim() }))
  }

  function requireSignIn() {
    setAuthMode('login')
    setAuthOpen(true)
  }

  function signOut() {
    localStorage.removeItem('campus-token')
    setToken(null)
    setUser(null)
    setNotice('You have signed out.')
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>, mode: 'login' | 'register') {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '')
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    try {
      if (mode === 'register') {
        await api.register(name, email, password)
        setAuthOpen(false)
        setApprovalNotice(true)
        return
      }
      const result = await api.login(email, password)
      localStorage.setItem('campus-token', result.token)
      setToken(result.token)
      setUser(result.user)
      setApprovalNotice(false)
      setAuthOpen(false)
      setNotice('Welcome back!')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    }
  }

  async function saveListing(values: ListingValues, image?: File) {
    if (!token) return
    try {
      await api.saveListing(values, token, editing?.id, image)
      setComposerOpen(false)
      setEditing(null)
      setSelected(null)
      setFilters((current) => ({ ...current }))
      setNotice(editing ? 'Your listing has been updated.' : 'Your item is now listed.')
      const { listings: updated } = await api.listings(filters)
      setListings(updated)
    } catch (cause) {
      throw cause
    }
  }

  async function toggleResolved(listing: Listing) {
    if (!token) return
    try {
      const { listing: updated } = await api.resolveListing(listing.id, token)
      setSelected(updated)
      setListings((current) => updated.isResolved
        ? current.filter((item) => item.id !== updated.id)
        : [updated, ...current.filter((item) => item.id !== updated.id)])
      setNotice(updated.isResolved ? 'Marked as resolved. Thanks for helping!' : 'Listing reopened.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not update this listing.')
    }
  }

  async function deleteListing(listing: Listing) {
    if (!token || !window.confirm('Remove this listing? This cannot be undone.')) return
    try {
      await api.deleteListing(listing.id, token)
      setListings((current) => current.filter((item) => item.id !== listing.id))
      setSelected(null)
      setNotice('Listing removed.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Could not remove this listing.')
    }
  }

  async function sendMessage(listing: Listing, content: string) {
    if (!token) throw new Error('Please sign in to contact the poster.')
    await api.sendMessage(listing.id, content, token)
    setNotice('Your message was sent privately to the poster.')
  }

  async function reportListing(listing: Listing, reason: ListingReport['reason'], details: string) {
    if (!token) throw new Error('Please sign in to report a listing.')
    await api.reportListing(listing.id, reason, details, token)
    setNotice('Your report has been sent to the campus administrators.')
  }

  function openComposer(listing?: Listing) {
    if (!user) {
      requireSignIn()
      return
    }
    setEditing(listing ?? null)
    setComposerOpen(true)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#" aria-label="LostLInk home">
          <span className="brand-mark"><Search size={19} strokeWidth={2.8} /></span>
          <span>Lost<span className="brand-accent">LInk</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#browse">Browse items</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <button className="inbox-button" onClick={() => setInboxOpen(true)}><MessageCircle size={17} /> Inbox</button>
              <span className="welcome-name">Hi, {user.name.split(' ')[0]}</span>
              <button className="text-button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button className="text-button" onClick={requireSignIn}>Log in</button>
          )}
          <button className="button button-dark header-post" onClick={() => openComposer()}>
            <span>Post an item</span><ArrowRight size={16} />
          </button>
        </div>
        <button className="mobile-menu" aria-label="Browse items" onClick={() => document.getElementById('browse')?.scrollIntoView({ behavior: 'smooth' })}>
          <Menu size={21} />
        </button>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> A little help goes a long way</div>
            <h1>Lost something?<br /><span>Let’s bring it</span><br />back to you.</h1>
            <p>Your campus community is looking out for you. Find a lost item or help someone reconnect with theirs.</p>
            <div className="hero-actions">
              <a className="button button-lime" href="#browse">Explore listings <ArrowDownRight size={17} /></a>
              <button className="button button-outline" onClick={() => openComposer()}>Post a found item <ArrowRight size={16} /></button>
            </div>
            <div className="social-proof"><div className="proof-avatars"><span>J</span><span>M</span><span>A</span><span>+</span></div><span>Good things happen when we look out for each other.</span></div>
          </div>
          <div className="hero-art" aria-label="Illustration of a found book and keys">
            <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
            <div className="sun-shape"></div>
            <div className="floating-note note-top"><span className="note-icon"><Check size={16} /></span><span><b>Found!</b><small>Library · 2 hours ago</small></span></div>
            <div className="book-art"><div className="book-spine"></div><div className="book-cover"><span className="book-label">FIELD<br />NOTES</span><div className="book-sun"></div><div className="book-lines"></div></div></div>
            <div className="key-art"><div className="key-ring"></div><div className="key-stem"></div><div className="key-teeth"></div><span className="key-tag">FIND<br />ME</span></div>
            <div className="floating-note note-bottom"><MapPin size={16} /><span>Student Center</span><span className="note-dot"></span></div>
            <span className="art-sparkle sparkle-one">✳</span><span className="art-sparkle sparkle-two">✦</span>
          </div>
          <div className="hero-bottom"><span>MADE FOR YOUR CAMPUS</span><span className="hero-bottom-line"></span><span>GOOD NEIGHBORS, BETTER ODDS</span></div>
        </section>

        <section className="trust-row" aria-label="Portal values">
          <div><ShieldCheck size={19} /><span><b>Privacy-first</b><small>Your contact details stay yours</small></span></div>
          <div><UserRound size={19} /><span><b>Student-powered</b><small>Real people, helping each other</small></span></div>
          <div><Clock3 size={19} /><span><b>Easy as it gets</b><small>Post or search in a few clicks</small></span></div>
        </section>

        <section className="browse-section" id="browse">
          <div className="section-heading">
            <div><span className="section-kicker">THE COMMUNITY BOARD</span><h2>Items on the lookout</h2><p>A familiar face, a favorite book, a set of keys. Let’s find what’s missing.</p></div>
            <button className="button button-outline light-outline" onClick={() => openComposer()}>Share an item <ArrowRight size={16} /></button>
          </div>

          <form className="search-panel" onSubmit={applySearch}>
            <label className="search-field"><Search size={19} /><span className="sr-only">Search by item or description</span><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search for an item, a place, a detail..." /></label>
            <label className="filter-field"><span className="sr-only">Filter by listing type</span><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}><option value="">All items</option><option value="LOST">Lost items</option><option value="FOUND">Found items</option></select><ChevronDown size={15} /></label>
            <label className="filter-field"><span className="sr-only">Filter by category</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{catalog.categories.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}</select><ChevronDown size={15} /></label>
            <label className="filter-field location-filter"><MapPin size={16} /><span className="sr-only">Filter by campus location</span><input list="campus-location-filter" value={filters.location} onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))} placeholder="Campus location" /><datalist id="campus-location-filter">{catalog.locations.map((location) => <option key={location.id} value={location.name} />)}</datalist></label>
            <button className="search-submit" aria-label="Search listings"><Search size={19} /></button>
          </form>

          <div className="results-top"><span>{loading ? 'Looking around...' : `${listings.length} ${listings.length === 1 ? 'item' : 'items'} to explore`}</span><button className="sort-button" onClick={() => setFilters({ query: '', status: '', category: '', location: '' })}>Clear filters <X size={14} /></button></div>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {loading ? (
            <div className="loading-grid" aria-label="Loading listings"><div></div><div></div><div></div></div>
          ) : listings.length ? (
            <div className="listing-grid">
              {listings.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} categories={catalog.categories} onClick={() => setSelected(listing)} />)}
            </div>
          ) : (
            <div className="empty-state"><span className="empty-icon"><CircleHelp size={25} /></span><h3>No matching items just yet</h3><p>Try a different search, or post a listing so your campus can help.</p><button className="button button-dark" onClick={() => openComposer()}>Post an item <ArrowRight size={16} /></button></div>
          )}
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-intro"><span className="section-kicker">THREE LITTLE STEPS</span><h2>Lost to found.<br /><span>It can be that simple.</span></h2><p>We made it easy to ask for help and even easier to give it.</p><div className="how-doodle">↘</div></div>
          <div className="steps">
            <article><span className="step-number">01</span><span className="step-icon"><Search size={20} /></span><h3>Look around</h3><p>Search recent posts or narrow things down by category and campus spot.</p></article>
            <article><span className="step-number">02</span><span className="step-icon"><Tag size={20} /></span><h3>Post the details</h3><p>Share what went missing or what you found. A small detail can make all the difference.</p></article>
            <article><span className="step-number">03</span><span className="step-icon"><MessageCircle size={20} /></span><h3>Say hello, safely</h3><p>Send a private message through the portal. Your personal contact details stay private.</p></article>
          </div>
        </section>

        <section className="closing-cta"><div><span className="section-kicker">A GOOD PLACE TO START</span><h2>Found something?<br /><span>Be someone’s hero.</span></h2></div><button className="button button-lime" onClick={() => openComposer()}>Post a found item <ArrowRight size={16} /></button><div className="cta-star">✳</div></section>
      </main>

      <footer className="site-footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><Search size={16} strokeWidth={2.8} /></span><span>Lost<span className="brand-accent">LInk</span></span></a><span>Made for campus. Built on kindness.</span><a href="/admin/login">Administrator sign in</a><a href="#browse">Back to the board ↑</a></footer>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
      {approvalNotice && <div className="toast" role="status"><Check size={16} />Your account is waiting for admin approval.<button onClick={() => setApprovalNotice(false)} aria-label="Dismiss approval message"><X size={15} /></button></div>}
      {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} onClose={() => setAuthOpen(false)} onSubmit={handleAuth} error={error} clearError={() => setError('')} />}
      {selected && <ListingModal listing={selected} user={user} categoryName={categoryLabel(selected.category, catalog.categories)} onClose={() => setSelected(null)} onContact={sendMessage} onReport={reportListing} onLogin={requireSignIn} onEdit={() => openComposer(selected)} onResolve={() => toggleResolved(selected)} onDelete={() => deleteListing(selected)} />}
      {composerOpen && <ListingForm initial={editing} categories={catalog.categories} locations={catalog.locations} onClose={() => { setComposerOpen(false); setEditing(null) }} onSave={saveListing} />}
      {inboxOpen && <InboxModal token={token} user={user} onClose={() => setInboxOpen(false)} />}
    </div>
  )
}

function ListingCard({ listing, index, categories, onClick }: { listing: Listing; index: number; categories: Pick<CatalogCategory, 'key' | 'name'>[]; onClick: () => void }) {
  return (
    <button className={`listing-card card-${index % 4}`} onClick={onClick} aria-label={`View ${listing.title}, ${listing.status.toLowerCase()} item`}>
      <div className={`card-visual visual-${listing.category.toLowerCase()}`}>
        {listing.imagePath ? <img src={listing.imagePath} alt="" /> : <CategoryIllustration category={listing.category} />}
        <span className={`status-pill status-${listing.status.toLowerCase()}`}>{listing.status === 'FOUND' ? 'Found' : 'Lost'}</span>
        <span className="card-date">{formatDate(listing.approximateDate)}</span>
      </div>
      <div className="card-content"><div className="card-category">{categoryIcon(listing.category)}<span>{categoryLabel(listing.category, categories)}</span></div><h3>{listing.title}</h3><p>{listing.description}</p><div className="card-meta"><span><MapPin size={14} />{listing.location}</span><span className="card-owner"><span className="owner-dot">{listing.owner.name.charAt(0)}</span>{listing.owner.name.split(' ')[0]}</span></div></div>
    </button>
  )
}

function CategoryIllustration({ category }: { category: ItemCategory }) {
  if (category === 'BOOKS') return <div className="illustration-book"><span className="illustration-book-label">NOTES<br />& IDEAS</span><span className="illustration-flower">✳</span></div>
  if (category === 'KEYS') return <div className="illustration-keys"><div className="illustration-key"><i></i><b></b></div><div className="illustration-key second-key"><i></i><b></b></div><span className="illustration-key-tag"></span></div>
  if (category === 'ID_CARD') return <div className="illustration-card"><div className="id-avatar"></div><div className="id-lines"><i></i><i></i><i></i></div><span className="id-stamp">CAMPUS<br />ID</span></div>
  if (category === 'ELECTRONICS') return <div className="illustration-phone"><span></span><i></i><b></b></div>
  if (category === 'CLOTHING') return <div className="illustration-shirt"><span></span><i></i></div>
  return <div className="illustration-generic"><Sparkles size={53} strokeWidth={1.2} /><span>?</span></div>
}

function ModalFrame({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-card${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true">{children}</section></div>
}

function AuthModal({ mode, setMode, onClose, onSubmit, error, clearError }: {
  mode: 'login' | 'register'
  setMode: (mode: 'login' | 'register') => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>, mode: 'login' | 'register') => Promise<void>
  error: string
  clearError: () => void
}) {
  return <ModalFrame onClose={onClose}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button><div className="modal-kicker"><ShieldCheck size={16} /> PRIVATE & SECURE</div><h2>{mode === 'login' ? 'Welcome back.' : 'Join your campus.'}</h2><p className="modal-lead">{mode === 'login' ? 'Sign in to post an item or message someone.' : 'Create an account to help your campus community.'}</p><form className="modal-form" onSubmit={(event) => { clearError(); void onSubmit(event, mode) }}>{mode === 'register' && <label>Your name<input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Jordan Lee" /></label>}<label>Student email<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@campus.edu" /></label><label>Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} maxLength={100} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark form-submit" type="submit">{mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight size={16} /></button></form><p className="modal-switch">{mode === 'login' ? 'New around here?' : 'Already have an account?'} <button onClick={() => { clearError(); setMode(mode === 'login' ? 'register' : 'login') }}>{mode === 'login' ? 'Create an account' : 'Log in'}</button></p></ModalFrame>
}

function ListingForm({ initial, categories, locations, onClose, onSave }: {
  initial: Listing | null
  categories: Pick<CatalogCategory, 'key' | 'name'>[]
  locations: Pick<CampusLocation, 'id' | 'name'>[]
  onClose: () => void
  onSave: (values: ListingValues, image?: File) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [imageName, setImageName] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const file = form.get('image')
    const values: ListingValues = {
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      status: String(form.get('status') ?? 'LOST') as ListingValues['status'],
      category: String(form.get('category') ?? ''),
      approximateDate: String(form.get('approximateDate') ?? ''),
      location: String(form.get('location') ?? ''),
    }
    try {
      await onSave(values, file instanceof File && file.size ? file : undefined)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save your listing.')
    } finally {
      setSaving(false)
    }
  }

  return <ModalFrame onClose={onClose} wide><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button><div className="modal-kicker"><Tag size={15} /> SHARE WITH YOUR CAMPUS</div><h2>{initial ? 'Update your listing.' : 'What are we looking for?'}</h2><p className="modal-lead">A few useful details help the right person find their way to you.</p><form className="modal-form listing-form" onSubmit={(event) => void submit(event)}><div className="form-two-col"><label>Listing type<select name="status" defaultValue={initial?.status ?? 'LOST'}><option value="LOST">I lost something</option><option value="FOUND">I found something</option></select></label><label>Category<select name="category" required defaultValue={initial?.category ?? categories[0]?.key ?? ''}>{initial && !categories.some(({ key }) => key === initial.category) && <option value={initial.category}>{categoryLabel(initial.category)}</option>}{categories.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}</select></label></div><label>Item name<input name="title" required minLength={3} maxLength={100} defaultValue={initial?.title ?? ''} placeholder="e.g. Blue water bottle" /></label><label>Description<textarea name="description" rows={3} required minLength={10} maxLength={2000} defaultValue={initial?.description ?? ''} placeholder="Add helpful details like color, brand, or where you last saw it." /></label><div className="form-two-col"><label>Approximate date<input type="date" name="approximateDate" required defaultValue={initial ? initial.approximateDate.slice(0, 10) : new Date().toISOString().slice(0, 10)} /></label><label>Campus location<select name="location" required defaultValue={initial?.location ?? locations[0]?.name ?? ''}>{initial && !locations.some(({ name }) => name === initial.location) && <option value={initial.location}>{initial.location}</option>}{locations.map((location) => <option key={location.id} value={location.name}>{location.name}</option>)}</select></label></div>{(!categories.length || !locations.length) && <p className="form-error" role="alert">No active categories or campus locations are available. Contact an administrator.</p>}<label className="upload-field">Optional image<span className="upload-control"><input type="file" name="image" accept="image/jpeg,image/png,image/webp" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? '')} /><span>{imageName || 'Choose a JPEG, PNG, or WebP (up to 5 MB)'}</span></span></label><p className="privacy-hint"><ShieldCheck size={15} /> Your email and phone number are never shown on a listing.</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="button button-quiet" type="button" onClick={onClose}>Cancel</button><button className="button button-dark" type="submit" disabled={saving || !categories.length || !locations.length}>{saving ? 'Saving...' : initial ? 'Save changes' : 'Post listing'} <ArrowRight size={16} /></button></div></form></ModalFrame>
}

function ListingModal({ listing, user, categoryName, onClose, onContact, onReport, onLogin, onEdit, onResolve, onDelete }: {
  listing: Listing
  user: User | null
  categoryName: string
  onClose: () => void
  onContact: (listing: Listing, content: string) => Promise<void>
  onReport: (listing: Listing, reason: ListingReport['reason'], details: string) => Promise<void>
  onLogin: () => void
  onEdit: () => void
  onResolve: () => void
  onDelete: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<ListingReport['reason']>('INAPPROPRIATE')
  const [reportDetails, setReportDetails] = useState('')
  const [error, setError] = useState('')
  const isOwner = user?.id === listing.ownerId

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await onContact(listing, message)
      setMessage('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReporting(true)
    setError('')
    try {
      await onReport(listing, reportReason, reportDetails.trim())
      setReportOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send this report.')
    } finally {
      setReporting(false)
    }
  }

  return <ModalFrame onClose={onClose} wide>
    <button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button>
    <div className="detail-layout">
      <div className={`detail-image visual-${listing.category.toLowerCase()}`}>
        {listing.imagePath ? <img src={listing.imagePath} alt={`Photo of ${listing.title}`} /> : <CategoryIllustration category={listing.category} />}
        <span className={`status-pill status-${listing.status.toLowerCase()}`}>{listing.status === 'FOUND' ? 'Found' : 'Lost'}</span>
      </div>
      <div className="detail-copy">
        <div className="modal-kicker">{categoryIcon(listing.category)} {categoryName} <span className="detail-divider">·</span> {formatDate(listing.approximateDate)}</div>
        <h2>{listing.title}</h2>
        <p className="detail-description">{listing.description}</p>
        <div className="detail-location"><MapPin size={17} /><span><b>{listing.location}</b><small>Campus location</small></span></div>
        <div className="poster-info"><span className="poster-avatar">{listing.owner.name.charAt(0)}</span><span><b>Posted by {listing.owner.name}</b><small>Personal contact details stay private</small></span><ShieldCheck size={18} /></div>
        {isOwner ? <div className="owner-actions">
          <button className="button button-dark" onClick={onEdit}>Edit listing</button>
          <button className="button button-outline detail-resolve" onClick={onResolve}>{listing.isResolved ? 'Reopen listing' : 'Mark resolved'}</button>
          <button className="delete-link" onClick={onDelete}>Remove listing</button>
        </div> : listing.isResolved ? <div className="resolved-note"><Check size={18} /> This item has been marked resolved.</div> : user ? <>
          <form className="contact-form" onSubmit={(event) => void submitMessage(event)}>
            <label htmlFor="contact-message">Send a private message</label>
            <textarea id="contact-message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={1000} rows={3} required placeholder="Share a helpful detail or arrange a safe way to connect..." />
            <div className="contact-bottom"><span>Your email stays private.</span><button className="button button-dark" type="submit" disabled={sending || message.trim().length < 10}>{sending ? 'Sending...' : 'Send message'} <ArrowRight size={15} /></button></div>
          </form>
          {reportOpen ? <form className="contact-form report-form" onSubmit={(event) => void submitReport(event)}>
            <label htmlFor="report-reason">Report this listing</label>
            <select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as ListingReport['reason'])}>
              <option value="INAPPROPRIATE">Inappropriate content</option>
              <option value="MISLEADING">Misleading information</option>
              <option value="SPAM">Spam</option>
              <option value="OTHER">Other concern</option>
            </select>
            <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={2} placeholder="Optional details for the administrators" />
            <div className="contact-bottom"><button className="text-button" type="button" onClick={() => setReportOpen(false)}>Cancel</button><button className="button button-dark" type="submit" disabled={reporting}>{reporting ? 'Sending...' : 'Send report'}</button></div>
          </form> : <button className="delete-link report-trigger" onClick={() => setReportOpen(true)}><AlertTriangle size={14} /> Report listing</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </> : <div className="sign-in-prompt">
          <p>Sign in to send the poster a private message or report this listing.</p>
          <button className="button button-dark" onClick={onLogin}>Log in <ArrowRight size={15} /></button>
        </div>}
      </div>
    </div>
  </ModalFrame>
}

function InboxModal({ token, user, onClose }: { token: string | null; user: User | null; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    api.messages(token).then(({ messages: results }) => setMessages(results)).catch((cause: Error) => setError(cause.message)).finally(() => setLoading(false))
  }, [token])

  return <ModalFrame onClose={onClose}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={20} /></button><div className="modal-kicker"><MessageCircle size={15} /> YOUR CAMPUS CONVERSATIONS</div><h2>Your inbox.</h2><p className="modal-lead">Messages about your listings, and the notes you’ve sent.</p>{loading ? <p className="inbox-empty">Loading your messages...</p> : error ? <p className="form-error" role="alert">{error}</p> : messages.length ? <div className="message-list">{messages.map((item) => <article className="message-item" key={item.id}><div className="message-item-top"><b>{item.senderId === user?.id ? 'You' : item.sender.name}</b><time>{formatDate(item.createdAt)}</time></div><span className="message-listing">Re: {item.listing.title}</span><p>{item.content}</p></article>)}</div> : <div className="inbox-empty"><MessageCircle size={25} /><b>No messages yet</b><span>When someone reaches out, you’ll find it here.</span></div>}</ModalFrame>
}

interface AdminToolProps {
  token: string
  onNotice: (message: string) => void
  onError: (message: string) => void
}

function AdminCatalogTools({ token, onNotice, onError }: AdminToolProps) {
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [locations, setLocations] = useState<CampusLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>({})
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({})

  async function reload() {
    setLoading(true)
    try {
      const [categoryResult, locationResult] = await Promise.all([api.adminCategories(token), api.adminLocations(token)])
      setCategories(categoryResult.categories)
      setLocations(locationResult.locations)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load catalog data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [token])

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await api.createCategory(String(form.get('name') ?? ''), token)
      formElement.reset()
      onError('')
      onNotice('Category added.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not add this category.')
    }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      await api.createLocation(String(form.get('name') ?? ''), token)
      formElement.reset()
      onError('')
      onNotice('Campus location added.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not add this location.')
    }
  }

  async function updateCategory(category: CatalogCategory, values: { name?: string; isActive?: boolean }) {
    try {
      await api.updateCategory(category.id, values, token)
      onError('')
      onNotice('Category updated.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update this category.')
    }
  }

  async function deleteCategory(category: CatalogCategory) {
    if (!window.confirm(`Delete the unused category "${category.name}"?`)) return
    try {
      await api.deleteCategory(category.id, token)
      onError('')
      onNotice('Category deleted.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not delete this category.')
    }
  }

  async function updateLocation(location: CampusLocation, values: { name?: string; isActive?: boolean }) {
    try {
      await api.updateLocation(location.id, values, token)
      onError('')
      onNotice('Campus location updated.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update this location.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">LISTING OPTIONS</span><h2>Categories and campus locations</h2></div></div>
    <div className="admin-tools-grid">
      <div className="admin-tool-card"><h3>Categories</h3><form className="admin-inline-form" onSubmit={(event) => void createCategory(event)}><input name="name" required minLength={2} maxLength={60} placeholder="New category name" /><button className="button button-dark" type="submit"><Plus size={15} /> Add</button></form>
        {loading ? <p className="inbox-empty">Loading categories...</p> : <div className="admin-tool-list">{categories.map((category) => <article className="admin-tool-row" key={category.id}>
          <div className="admin-tool-row-main"><input aria-label={`Rename ${category.name}`} value={categoryDrafts[category.id] ?? category.name} onChange={(event) => setCategoryDrafts((current) => ({ ...current, [category.id]: event.target.value }))} /><span>{category.listingCount} listing{category.listingCount === 1 ? '' : 's'} · {category.isActive ? 'Active' : 'Inactive'}</span></div>
          <div className="admin-tool-row-actions"><button className="text-button" onClick={() => void updateCategory(category, { name: categoryDrafts[category.id] ?? category.name })}>Save</button><button className="text-button" onClick={() => void updateCategory(category, { isActive: !category.isActive })}>{category.isActive ? 'Deactivate' : 'Activate'}</button>{category.listingCount === 0 && <button className="admin-remove-button" onClick={() => void deleteCategory(category)}>Delete</button>}</div>
        </article>)}</div>}
      </div>
      <div className="admin-tool-card"><h3>Campus locations</h3><form className="admin-inline-form" onSubmit={(event) => void createLocation(event)}><input name="name" required minLength={2} maxLength={60} placeholder="New location name" /><button className="button button-dark" type="submit"><Plus size={15} /> Add</button></form>
        {loading ? <p className="inbox-empty">Loading locations...</p> : <div className="admin-tool-list">{locations.map((location) => <article className="admin-tool-row" key={location.id}>
          <div className="admin-tool-row-main"><input aria-label={`Rename ${location.name}`} value={locationDrafts[location.id] ?? location.name} onChange={(event) => setLocationDrafts((current) => ({ ...current, [location.id]: event.target.value }))} /><span>{location.listingCount} listing{location.listingCount === 1 ? '' : 's'} · {location.isActive ? 'Active' : 'Inactive'}</span></div>
          <div className="admin-tool-row-actions"><button className="text-button" onClick={() => void updateLocation(location, { name: locationDrafts[location.id] ?? location.name })}>Save</button><button className="text-button" onClick={() => void updateLocation(location, { isActive: !location.isActive })}>{location.isActive ? 'Deactivate' : 'Activate'}</button></div>
        </article>)}</div>}
      </div>
    </div>
  </section>
}

function AdminReportTools({ token, onNotice, onError }: AdminToolProps) {
  const [reports, setReports] = useState<ListingReport[]>([])
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    try {
      const result = await api.adminReports('PENDING', token)
      setReports(result.reports)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load reports.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [token])

  async function review(report: ListingReport, action: 'DISMISS' | 'ARCHIVE' | 'RESOLVE') {
    const prompt = action === 'ARCHIVE' ? 'Archive the reported listing?' : action === 'RESOLVE' ? 'Mark the reported listing as resolved?' : ''
    if (prompt && !window.confirm(prompt)) return
    try {
      if (action === 'DISMISS') await api.dismissReport(report.id, token)
      else await api.actionReport(report.id, action, token)
      onError('')
      onNotice(action === 'DISMISS' ? 'Report dismissed.' : `Listing ${action === 'ARCHIVE' ? 'archived' : 'resolved'} and report reviewed.`)
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not review this report.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">COMMUNITY SAFETY</span><h2>Student reports</h2></div><span className="admin-pending-count">{reports.length} pending</span></div>
    {loading ? <div className="inbox-empty">Loading reports...</div> : reports.length ? <div className="admin-tool-list">{reports.map((report) => <article className="admin-report" key={report.id}>
      <div><div className="admin-listing-meta"><AlertTriangle size={15} /><b>{report.reason.replace(/_/g, ' ')}</b><time>{formatDate(report.createdAt)}</time></div><h3>{report.listing.title}</h3><p>{report.details || 'No additional details provided.'}</p><small>Reported by {report.reporter.name} · {report.listing.location}</small></div>
      <div className="admin-tool-row-actions"><button className="text-button" onClick={() => void review(report, 'DISMISS')}>Dismiss</button><button className="button button-outline" onClick={() => void review(report, 'RESOLVE')}>Resolve listing</button><button className="admin-remove-button" onClick={() => void review(report, 'ARCHIVE')}>Archive listing</button></div>
    </article>)}</div> : <div className="admin-approval-empty">There are no pending student reports.</div>}
  </section>
}

function AdminBulkTools({ token, listings, onListingsChanged, onNotice, onError }: AdminToolProps & {
  listings: Listing[]
  onListingsChanged: () => Promise<void>
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [expiredOnly, setExpiredOnly] = useState(true)
  const now = Date.now()
  const eligible = listings.filter((listing) => !listing.archivedAt && (!expiredOnly || Boolean(listing.expiresAt && new Date(listing.expiresAt).getTime() <= now)))

  function toggle(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function moderate(action: 'ARCHIVE' | 'REMOVE') {
    if (!selectedIds.length) return
    const actionText = action === 'ARCHIVE' ? 'archive' : 'permanently remove'
    if (!window.confirm(`${actionText[0].toUpperCase()}${actionText.slice(1)} ${selectedIds.length} selected listing(s)?`)) return
    try {
      const result = await api.bulkModerate(selectedIds, action, token)
      setSelectedIds([])
      onError('')
      onNotice(`${result.affectedCount} listing(s) ${action === 'ARCHIVE' ? 'archived' : 'removed'}.`)
      await onListingsChanged()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not moderate selected listings.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">BULK MODERATION</span><h2>Archive or remove listings</h2></div></div>
    <label className="admin-checkbox-label"><input type="checkbox" checked={expiredOnly} onChange={(event) => { setExpiredOnly(event.target.checked); setSelectedIds([]) }} /> Show only expired listings</label>
    <div className="admin-tool-list">{eligible.map((listing) => <label className="admin-bulk-row" key={listing.id}>
      <input type="checkbox" checked={selectedIds.includes(listing.id)} onChange={() => toggle(listing.id)} />
      <span><b>{listing.title}</b><small>{listing.category} · {listing.location} · {listing.expiresAt ? `expires ${formatDate(listing.expiresAt)}` : 'no expiry set'}</small></span>
    </label>)}</div>
    {!eligible.length && <div className="admin-approval-empty">No matching listings are available for bulk moderation.</div>}
    <div className="admin-tool-row-actions admin-bulk-actions"><span>{selectedIds.length} selected</span><button className="button button-outline" disabled={!selectedIds.length} onClick={() => void moderate('ARCHIVE')}><Archive size={15} /> Archive selected</button><button className="admin-remove-button" disabled={!selectedIds.length} onClick={() => void moderate('REMOVE')}><Trash2 size={15} /> Remove selected</button></div>
  </section>
}

function AdminExpiryTools({ token, onNotice, onError }: AdminToolProps) {
  const [settingsDays, setSettingsDays] = useState(90)
  const [reviewDays, setReviewDays] = useState(30)
  const [listings, setListings] = useState<(Listing & { isExpired: boolean })[]>([])
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  async function reload() {
    setLoading(true)
    try {
      const result = await api.adminExpiry(reviewDays, token)
      setSettingsDays(result.settings.listingLifetimeDays)
      setListings(result.listings)
      setExpiryDates(Object.fromEntries(result.listings.map((listing) => [
        listing.id,
        listing.expiresAt ? listing.expiresAt.slice(0, 10) : '',
      ])))
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load expiry information.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload() }, [token, reviewDays])

  async function updateDefault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const { settings } = await api.updateListingLifetime(settingsDays, token)
      onError('')
      onNotice(`New listings will remain active for ${settings.listingLifetimeDays} days.`)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update listing lifetime.')
    }
  }

  async function updateExpiry(listing: Listing) {
    const expiresAt = expiryDates[listing.id]
    if (!expiresAt) return onError('Choose an expiry date first.')
    try {
      await api.updateListingExpiry(listing.id, expiresAt, token)
      onError('')
      onNotice('Listing expiry updated.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update listing expiry.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">LISTING LIFETIME</span><h2>Expiry settings and review</h2></div></div>
    <div className="admin-expiry-controls">
      <form className="admin-inline-form" onSubmit={(event) => void updateDefault(event)}><label>Default active period (days)<input type="number" min={1} max={3650} value={settingsDays} onChange={(event) => setSettingsDays(Number(event.target.value))} required /></label><button className="button button-dark" type="submit"><Settings2 size={15} /> Save default</button></form>
      <label>Review listings expiring within<select value={reviewDays} onChange={(event) => setReviewDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
    </div>
    {loading ? <div className="inbox-empty">Loading expiry queue...</div> : listings.length ? <div className="admin-tool-list">{listings.map((listing) => <article className="admin-expiry-row" key={listing.id}>
      <div><b>{listing.title}</b><small>{listing.isExpired ? 'Expired' : 'Due soon'} · {listing.expiresAt ? formatDate(listing.expiresAt) : 'No date'}</small></div>
      <div className="admin-tool-row-actions"><input aria-label={`Expiry date for ${listing.title}`} type="date" value={expiryDates[listing.id] ?? ''} onChange={(event) => setExpiryDates((current) => ({ ...current, [listing.id]: event.target.value }))} /><button className="text-button" onClick={() => void updateExpiry(listing)}>Update date</button></div>
    </article>)}</div> : <div className="admin-approval-empty">No listings are due to expire in this review window.</div>}
  </section>
}

function AdminAccountTools({ token, onNotice, onError }: AdminToolProps) {
  const [users, setUsers] = useState<ManagedStudent[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [loading, setLoading] = useState(true)

  async function reload(search = query, filter = status) {
    setLoading(true)
    try {
      const result = await api.adminUsers({ query: search, status: filter }, token)
      setUsers(result.users)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load student accounts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void reload('', 'ALL') }, [token])

  async function changeStatus(student: ManagedStudent) {
    const nextStatus = student.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    if (nextStatus === 'SUSPENDED' && !window.confirm(`Suspend ${student.name}'s account? They will no longer be able to sign in or use protected features.`)) return
    try {
      await api.updateUserStatus(student.id, nextStatus, token)
      onError('')
      onNotice(nextStatus === 'SUSPENDED' ? 'Student account suspended.' : 'Student account reactivated.')
      await reload()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not update this account.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">STUDENT ACCESS</span><h2>Manage approved accounts</h2></div></div>
    <form className="admin-filter-form" onSubmit={(event) => { event.preventDefault(); void reload() }}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" />
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select>
      <button className="button button-dark" type="submit"><Search size={15} /> Search</button>
    </form>
    {loading ? <div className="inbox-empty">Loading student accounts...</div> : users.length ? <div className="admin-tool-list">{users.map((student) => <article className="admin-expiry-row" key={student.id}>
      <div><b>{student.name}</b><small>{student.email} · {student.accountStatus.toLowerCase()} · approved {formatDate(student.createdAt)}</small></div>
      <button className={student.accountStatus === 'ACTIVE' ? 'admin-remove-button' : 'text-button'} onClick={() => void changeStatus(student)}>{student.accountStatus === 'ACTIVE' ? 'Suspend' : 'Reactivate'}</button>
    </article>)}</div> : <div className="admin-approval-empty">No approved student accounts match this search.</div>}
  </section>
}

function AdminActivityTools({ token, onError }: AdminToolProps) {
  const [activities, setActivities] = useState<AdminActivity[]>([])
  const [filters, setFilters] = useState({ query: '', action: '', from: '', to: '' })
  const [loading, setLoading] = useState(true)

  async function search(nextFilters = filters) {
    setLoading(true)
    try {
      const result = await api.adminActivity(nextFilters, token)
      setActivities(result.activities)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not load the activity log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void search({ query: '', action: '', from: '', to: '' }) }, [token])

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">ADMIN AUDIT</span><h2>Activity log</h2></div></div>
    <form className="admin-filter-form" onSubmit={(event) => { event.preventDefault(); void search() }}>
      <input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Search actions or admin" />
      <input value={filters.action} onChange={(event) => setFilters((current) => ({ ...current, action: event.target.value }))} placeholder="Action code" />
      <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
      <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
      <button className="button button-dark" type="submit"><Search size={15} /> Filter</button>
    </form>
    {loading ? <div className="inbox-empty">Loading activity...</div> : activities.length ? <div className="admin-tool-list">{activities.map((activity) => <article className="admin-expiry-row" key={activity.id}>
      <div><b>{activity.action.replace(/_/g, ' ')}</b><small>{activity.summary}</small></div><div className="admin-activity-meta"><span>{activity.adminName}</span><time>{new Date(activity.createdAt).toLocaleString()}</time></div>
    </article>)}</div> : <div className="admin-approval-empty">No activity matches those filters.</div>}
  </section>
}

function AdminExportTools({ token, onNotice, onError }: AdminToolProps) {
  async function download(kind: 'listings' | 'approvals') {
    try {
      const blob = await api.exportCsv(kind, token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = kind === 'listings' ? 'campus-listings.csv' : 'campus-account-approvals.csv'
      link.click()
      URL.revokeObjectURL(url)
      onError('')
      onNotice('CSV export downloaded. Sensitive contact details and passwords are excluded.')
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not download the export.')
    }
  }

  return <section className="admin-approval-section">
    <div className="admin-section-heading"><div><span className="section-kicker">SAFE DATA EXPORT</span><h2>Download CSV summaries</h2><p>Exports exclude passwords, email addresses, and private contact details.</p></div></div>
    <div className="admin-export-actions"><button className="button button-outline" onClick={() => void download('listings')}><Download size={16} /> Listings summary</button><button className="button button-outline" onClick={() => void download('approvals')}><Download size={16} /> Account approval summary</button></div>
  </section>
}

function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem('campus-token'))
  const [user, setUser] = useState<User | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequest[]>([])
  const [activeOperation, setActiveOperation] = useState<
    'registrations' | 'listings' | 'catalog' | 'reports' | 'bulk' | 'expiry' | 'accounts' | 'activity' | 'exports'
  >('listings')
  const [page, setPage] = useState(window.location.pathname)
  const [checking, setChecking] = useState(Boolean(token))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function navigate(path: string) {
    window.history.replaceState(null, '', path)
    setPage(path)
  }

  useEffect(() => {
    if (!token) {
      setUser(null)
      setChecking(false)
      if (page !== '/admin/login') navigate('/admin/login')
      return
    }
    let active = true
    setChecking(true)
    api.me(token).then(({ user: currentUser }) => {
      if (!active) return
      setUser(currentUser)
      setError(currentUser.role === 'ADMIN' ? '' : 'Administrator access is required.')
    }).catch(() => {
      if (!active) return
      localStorage.removeItem('campus-token')
      setToken(null)
      setUser(null)
      setError('Your session is invalid. Please sign in again.')
    }).finally(() => {
      if (active) setChecking(false)
    })
    return () => { active = false }
  }, [token])

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return
    let active = true
    setLoading(true)
    Promise.all([api.adminListings(token), api.pendingRegistrations(token)]).then(([listingResult, registrationResult]) => {
      if (!active) return
      setListings(listingResult.listings)
      setRegistrationRequests(registrationResult.registrations)
    }).catch((cause: Error) => {
      if (active) setError(cause.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [token, user])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError('')
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    try {
      const result = await api.adminLogin(email, password)
      localStorage.setItem('campus-token', result.token)
      setUser(result.user)
      setToken(result.token)
      navigate('/admin')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not sign in.')
    }
  }

  function signOut() {
    localStorage.removeItem('campus-token')
    setToken(null)
    setUser(null)
    setListings([])
    setError('')
    navigate('/admin/login')
  }

  async function markResolved(listing: Listing) {
    if (!token) return
    try {
      const { listing: updated } = await api.adminResolveListing(listing.id, token)
      setListings((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotice('Listing marked as resolved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this listing.')
    }
  }

  async function removeListing(listing: Listing) {
    if (!token || !window.confirm(`Permanently remove "${listing.title}"?`)) return
    try {
      await api.adminDeleteListing(listing.id, token)
      setListings((current) => current.filter((item) => item.id !== listing.id))
      setNotice('Listing removed.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove this listing.')
    }
  }

  async function decideRegistration(request: RegistrationRequest, decision: 'APPROVED' | 'REJECTED') {
    if (!token) return
    if (decision === 'REJECTED' && !window.confirm(`Reject the registration request from ${request.name}?`)) return
    try {
      if (decision === 'APPROVED') {
        await api.approveRegistration(request.id, token)
      } else {
        await api.rejectRegistration(request.id, token)
      }
      setRegistrationRequests((current) => current.filter((item) => item.id !== request.id))
      setNotice(decision === 'APPROVED'
        ? `${request.name} is approved and can now sign in.`
        : 'Registration request rejected.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this registration request.')
    }
  }

  async function openRegistrations() {
    setActiveOperation('registrations')
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const { registrations } = await api.pendingRegistrations(token)
      setRegistrationRequests(registrations)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load registration requests.')
    } finally {
      setLoading(false)
    }
  }

  async function reloadAdminListings() {
    if (!token) return
    const result = await api.adminListings(token)
    setListings(result.listings)
  }

  if (checking) {
    return <main className="admin-page"><div className="admin-panel"><p>Checking administrator access...</p></div></main>
  }

  if (token && user?.role !== 'ADMIN') {
    return <main className="admin-page"><section className="admin-panel"><div className="modal-kicker"><ShieldCheck size={16} /> ADMINISTRATOR ACCESS</div><h1>Access denied.</h1><p className="modal-lead">This account does not have administrator access.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark" onClick={signOut}>Sign in as administrator <ArrowRight size={16} /></button></section></main>
  }

  if (!token || user?.role !== 'ADMIN') {
    return <main className="admin-page"><section className="admin-panel"><a className="brand" href="/"><span className="brand-mark"><Search size={19} strokeWidth={2.8} /></span><span>Lost<span className="brand-accent">LInk</span></span></a><div className="modal-kicker admin-login-kicker"><ShieldCheck size={16} /> ADMINISTRATOR PORTAL</div><h1>Admin sign in.</h1><p className="modal-lead">Sign in with your administrator account to review campus listings.</p><form className="modal-form" onSubmit={(event) => void signIn(event)}><label>Email<input name="email" type="email" autoComplete="username" required maxLength={254} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required maxLength={100} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark form-submit" type="submit">Sign in <ArrowRight size={16} /></button></form><a className="admin-back-link" href="/">Return to LostLInk</a></section></main>
  }

  return <main className="admin-page admin-dashboard">
    <header className="admin-header"><a className="brand" href="/"><span className="brand-mark"><Search size={19} strokeWidth={2.8} /></span><span>Lost<span className="brand-accent">LInk</span></span></a><div><span className="welcome-name">Administrator · {user.name}</span><button className="text-button" onClick={signOut}>Sign out</button></div></header>
    <section className="admin-content"><div className="admin-title-row"><div><div className="modal-kicker"><ShieldCheck size={16} /> ADMINISTRATOR PORTAL</div><h1>Admin dashboard</h1><p>Review registrations, listings, campus catalogs, and account activity.</p></div><a className="admin-back-link" href="/">View public listings <ArrowRight size={15} /></a></div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {notice && <div className="notice admin-notice" role="status">{notice}</div>}
      <nav className="admin-operations" aria-label="Administrator operations">
        <button className={`admin-operation${activeOperation === 'registrations' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'registrations'} onClick={() => void openRegistrations()}>
          <span className="admin-operation-icon"><UserRound size={20} /></span><span className="admin-operation-copy"><b>Account approvals</b><small>Review student requests</small></span><span className="admin-operation-count">{registrationRequests.length}</span>
        </button>
        <button className={`admin-operation${activeOperation === 'listings' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'listings'} onClick={() => setActiveOperation('listings')}>
          <span className="admin-operation-icon"><Tag size={20} /></span><span className="admin-operation-copy"><b>Listing review</b><small>Resolve or remove posts</small></span><span className="admin-operation-count">{listings.length}</span>
        </button>
        <button className={`admin-operation${activeOperation === 'catalog' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'catalog'} onClick={() => setActiveOperation('catalog')}>
          <span className="admin-operation-icon"><MapPinned size={20} /></span><span className="admin-operation-copy"><b>Categories & locations</b><small>Manage listing choices</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'reports' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'reports'} onClick={() => setActiveOperation('reports')}>
          <span className="admin-operation-icon"><AlertTriangle size={20} /></span><span className="admin-operation-copy"><b>Student reports</b><small>Review reported posts</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'bulk' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'bulk'} onClick={() => setActiveOperation('bulk')}>
          <span className="admin-operation-icon"><ListChecks size={20} /></span><span className="admin-operation-copy"><b>Bulk moderation</b><small>Archive or remove multiple</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'expiry' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'expiry'} onClick={() => setActiveOperation('expiry')}>
          <span className="admin-operation-icon"><CalendarClock size={20} /></span><span className="admin-operation-copy"><b>Listing expiry</b><small>Set lifetime and review due items</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'accounts' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'accounts'} onClick={() => setActiveOperation('accounts')}>
          <span className="admin-operation-icon"><Users size={20} /></span><span className="admin-operation-copy"><b>Student accounts</b><small>Suspend or reactivate</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'activity' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'activity'} onClick={() => setActiveOperation('activity')}>
          <span className="admin-operation-icon"><Activity size={20} /></span><span className="admin-operation-copy"><b>Activity log</b><small>Search admin actions</small></span>
        </button>
        <button className={`admin-operation${activeOperation === 'exports' ? ' admin-operation-active' : ''}`} type="button" aria-pressed={activeOperation === 'exports'} onClick={() => setActiveOperation('exports')}>
          <span className="admin-operation-icon"><FileText size={20} /></span><span className="admin-operation-copy"><b>Data export</b><small>Download safe CSV summaries</small></span>
        </button>
      </nav>
      {activeOperation === 'registrations' ? <section className="admin-approval-section" aria-labelledby="registration-heading">
        <div className="admin-section-heading"><div><span className="section-kicker">ACCOUNT ACCESS</span><h2 id="registration-heading">Pending registrations</h2></div><span className="admin-pending-count">{registrationRequests.length} awaiting review</span></div>
        {loading ? <div className="inbox-empty">Loading registration requests...</div> : registrationRequests.length ? <div className="admin-registration-list">{registrationRequests.map((request) => <article className="admin-registration" key={request.id}>
          <div className="admin-registration-info"><b>{request.name}</b><span>{request.email}</span><time>Requested {formatDate(request.createdAt)}</time></div>
          <div className="admin-registration-actions"><button className="button button-dark" onClick={() => void decideRegistration(request, 'APPROVED')}>Approve</button><button className="admin-remove-button" onClick={() => void decideRegistration(request, 'REJECTED')}>Reject</button></div>
        </article>)}</div> : <div className="admin-approval-empty">There are no pending registration requests.</div>}
      </section> : activeOperation === 'listings' ? <section aria-labelledby="listing-review-heading">
        <div className="admin-listing-heading"><div><span className="section-kicker">COMMUNITY BOARD</span><h2 id="listing-review-heading">Listing review</h2><p>Remove inappropriate posts or mark items as resolved.</p></div></div>
        <div className="admin-results-top"><b>{loading ? 'Loading listings...' : `${listings.length} listing${listings.length === 1 ? '' : 's'}`}</b><span>Most recent 200</span></div>
        {loading ? <div className="inbox-empty">Loading listings...</div> : listings.length ? <div className="admin-list-grid">{listings.map((listing) => <article className="admin-listing" key={listing.id}>
          <div className="admin-listing-image">{listing.imagePath ? <img src={listing.imagePath} alt="" /> : <span>{categoryLabel(listing.category)}</span>}</div>
          <div className="admin-listing-body"><div className="admin-listing-meta"><span className={`status-pill status-${listing.status.toLowerCase()}`}>{listing.status}</span><span>{listing.isResolved ? 'Resolved' : 'Open'}</span></div><h2>{listing.title}</h2><p>{listing.description}</p><div className="admin-listing-details"><span>{listing.location}</span><span>Posted by {listing.owner.name}</span><time>{formatDate(listing.createdAt)}</time></div><div className="admin-listing-actions"><button className="button button-outline" disabled={listing.isResolved} onClick={() => void markResolved(listing)}>{listing.isResolved ? 'Resolved' : 'Mark resolved'}</button><button className="admin-remove-button" onClick={() => void removeListing(listing)}>Remove listing</button></div></div>
        </article>)}</div> : <div className="inbox-empty"><b>No listings to review</b><span>New campus posts will appear here.</span></div>}
      </section> : activeOperation === 'catalog' ? <AdminCatalogTools token={token} onNotice={setNotice} onError={setError} />
        : activeOperation === 'reports' ? <AdminReportTools token={token} onNotice={setNotice} onError={setError} />
          : activeOperation === 'bulk' ? <AdminBulkTools token={token} listings={listings} onListingsChanged={reloadAdminListings} onNotice={setNotice} onError={setError} />
            : activeOperation === 'expiry' ? <AdminExpiryTools token={token} onNotice={setNotice} onError={setError} />
              : activeOperation === 'accounts' ? <AdminAccountTools token={token} onNotice={setNotice} onError={setError} />
                : activeOperation === 'activity' ? <AdminActivityTools token={token} onNotice={setNotice} onError={setError} />
                  : <AdminExportTools token={token} onNotice={setNotice} onError={setError} />}
    </section>
  </main>
}

export default App
