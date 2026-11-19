import type {
  AdminActivity,
  CampusLocation,
  CatalogCategory,
  Listing,
  ListingReport,
  ListingValues,
  ManagedStudent,
  Message,
  RegistrationRequest,
  User,
} from './types'

interface ApiOptions extends RequestInit {
  token?: string | null
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { token, headers, body, ...requestOptions } = options
  const requestHeaders = new Headers(headers)
  if (token) requestHeaders.set('Authorization', `Bearer ${token}`)
  if (body && !(body instanceof FormData)) requestHeaders.set('Content-Type', 'application/json')

  const response = await fetch(`/api${path}`, {
    ...requestOptions,
    headers: requestHeaders,
    body,
  })
  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error)
      : 'Something went wrong. Please try again.'
    throw new Error(error)
  }
  return payload as T
}

export const api = {
  listings(filters: { query: string; status: string; category: string; location: string }) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value)
    })
    return request<{ listings: Listing[] }>(`/listings?${params.toString()}`)
  },
  catalog() {
    return request<{ categories: Pick<CatalogCategory, 'key' | 'name'>[]; locations: Pick<CampusLocation, 'id' | 'name'>[] }>('/catalog')
  },
  listing(id: string) {
    return request<{ listing: Listing }>(`/listings/${encodeURIComponent(id)}`)
  },
  register(name: string, email: string, password: string) {
    return request<{ message: string; user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    })
  },
  login(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
  adminLogin(email: string, password: string) {
    return request<{ token: string; user: User }>('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
  },
  me(token: string) {
    return request<{ user: User }>('/auth/me', { token })
  },
  saveListing(values: ListingValues, token: string, id?: string, image?: File) {
    const body = new FormData()
    Object.entries(values).forEach(([key, value]) => body.append(key, value))
    if (image) body.append('image', image)
    return request<{ listing: Listing }>(id ? `/listings/${encodeURIComponent(id)}` : '/listings', {
      method: id ? 'PATCH' : 'POST',
      body,
      token,
    })
  },
  resolveListing(id: string, token: string) {
    return request<{ listing: Listing }>(`/listings/${encodeURIComponent(id)}/resolve`, {
      method: 'PATCH',
      token,
    })
  },
  deleteListing(id: string, token: string) {
    return request<void>(`/listings/${encodeURIComponent(id)}`, { method: 'DELETE', token })
  },
  reportListing(id: string, reason: ListingReport['reason'], details: string, token: string) {
    return request<{ message: string }>(`/listings/${encodeURIComponent(id)}/reports`, {
      method: 'POST',
      body: JSON.stringify({ reason, details }),
      token,
    })
  },
  adminListings(token: string) {
    return request<{ listings: Listing[] }>('/admin/listings', { token })
  },
  pendingRegistrations(token: string) {
    return request<{ registrations: RegistrationRequest[] }>('/admin/registrations/pending', { token })
  },
  approveRegistration(id: string, token: string) {
    return request<{ approvalStatus: 'APPROVED'; approvalDecidedAt: string }>(
      `/admin/registrations/${encodeURIComponent(id)}/approve`,
      { method: 'PATCH', token },
    )
  },
  rejectRegistration(id: string, token: string) {
    return request<{ approvalStatus: 'REJECTED'; approvalDecidedAt: string }>(
      `/admin/registrations/${encodeURIComponent(id)}/reject`,
      { method: 'PATCH', token },
    )
  },
  adminResolveListing(id: string, token: string) {
    return request<{ listing: Listing }>(`/admin/listings/${encodeURIComponent(id)}/resolve`, {
      method: 'PATCH',
      token,
    })
  },
  adminDeleteListing(id: string, token: string) {
    return request<void>(`/admin/listings/${encodeURIComponent(id)}`, { method: 'DELETE', token })
  },
  adminCategories(token: string) {
    return request<{ categories: CatalogCategory[] }>('/admin/catalog/categories', { token })
  },
  createCategory(name: string, token: string) {
    return request<{ category: CatalogCategory }>('/admin/catalog/categories', {
      method: 'POST', body: JSON.stringify({ name }), token,
    })
  },
  updateCategory(id: string, values: { name?: string; isActive?: boolean }, token: string) {
    return request<{ category: CatalogCategory }>(`/admin/catalog/categories/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(values), token,
    })
  },
  deleteCategory(id: string, token: string) {
    return request<void>(`/admin/catalog/categories/${encodeURIComponent(id)}`, { method: 'DELETE', token })
  },
  adminLocations(token: string) {
    return request<{ locations: CampusLocation[] }>('/admin/catalog/locations', { token })
  },
  createLocation(name: string, token: string) {
    return request<{ location: CampusLocation }>('/admin/catalog/locations', {
      method: 'POST', body: JSON.stringify({ name }), token,
    })
  },
  updateLocation(id: string, values: { name?: string; isActive?: boolean }, token: string) {
    return request<{ location: CampusLocation }>(`/admin/catalog/locations/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(values), token,
    })
  },
  adminReports(status: string, token: string) {
    return request<{ reports: ListingReport[] }>(`/admin/reports?status=${encodeURIComponent(status)}`, { token })
  },
  dismissReport(id: string, token: string) {
    return request<{ status: string }>(`/admin/reports/${encodeURIComponent(id)}/dismiss`, { method: 'PATCH', token })
  },
  actionReport(id: string, action: 'ARCHIVE' | 'RESOLVE', token: string) {
    return request<{ status: string; action: string }>(`/admin/reports/${encodeURIComponent(id)}/action`, {
      method: 'PATCH', body: JSON.stringify({ action }), token,
    })
  },
  bulkModerate(ids: string[], action: 'ARCHIVE' | 'REMOVE', token: string) {
    return request<{ action: string; affectedCount: number }>('/admin/listings/bulk', {
      method: 'POST', body: JSON.stringify({ ids, action }), token,
    })
  },
  adminExpiry(days: number, token: string) {
    return request<{
      settings: { listingLifetimeDays: number }
      listings: (Listing & { isExpired: boolean })[]
    }>(`/admin/expiry?days=${days}`, { token })
  },
  updateListingLifetime(listingLifetimeDays: number, token: string) {
    return request<{ settings: { listingLifetimeDays: number } }>('/admin/expiry/settings', {
      method: 'PATCH', body: JSON.stringify({ listingLifetimeDays }), token,
    })
  },
  updateListingExpiry(id: string, expiresAt: string, token: string) {
    return request<{ listing: { id: string; expiresAt: string } }>(`/admin/listings/${encodeURIComponent(id)}/expiry`, {
      method: 'PATCH', body: JSON.stringify({ expiresAt }), token,
    })
  },
  adminUsers(filters: { query: string; status: string }, token: string) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return request<{ users: ManagedStudent[] }>(`/admin/users?${params.toString()}`, { token })
  },
  updateUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED', token: string) {
    const action = status === 'SUSPENDED' ? 'suspend' : 'activate'
    return request<{ user: { id: string; accountStatus: 'ACTIVE' | 'SUSPENDED' } }>(
      `/admin/users/${encodeURIComponent(id)}/${action}`, { method: 'PATCH', token },
    )
  },
  adminActivity(filters: { query: string; action: string; from: string; to: string }, token: string) {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value) })
    return request<{ activities: AdminActivity[] }>(`/admin/activity?${params.toString()}`, { token })
  },
  async exportCsv(kind: 'listings' | 'approvals', token: string) {
    const response = await fetch(`/api/admin/exports/${kind}.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const payload: unknown = await response.json().catch(() => null)
      const error = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'Could not download the export.'
      throw new Error(error)
    }
    return response.blob()
  },
  sendMessage(id: string, content: string, token: string) {
    return request<{ message: { id: string; content: string; listingId: string; createdAt: string } }>(
      `/listings/${encodeURIComponent(id)}/messages`,
      { method: 'POST', body: JSON.stringify({ content }), token },
    )
  },
  messages(token: string) {
    return request<{ messages: Message[] }>('/messages', { token })
  },
}
