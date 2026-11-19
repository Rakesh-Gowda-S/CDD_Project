export type ListingStatus = 'LOST' | 'FOUND'

export type ItemCategory = string

export interface User {
  id: string
  name: string
  role?: 'STUDENT' | 'ADMIN'
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED'
  accountStatus?: 'ACTIVE' | 'SUSPENDED'
}

export interface RegistrationRequest {
  id: string
  name: string
  email: string
  createdAt: string
}

export interface Listing {
  id: string
  title: string
  description: string
  status: ListingStatus
  category: ItemCategory
  approximateDate: string
  location: string
  imagePath: string | null
  isResolved: boolean
  expiresAt: string | null
  archivedAt: string | null
  ownerId: string
  owner: User
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  content: string
  createdAt: string
  senderId: string
  sender: { name: string }
  listing: { id: string; title: string; ownerId: string }
}

export interface ListingValues {
  title: string
  description: string
  status: ListingStatus
  category: ItemCategory
  approximateDate: string
  location: string
}

export interface CatalogCategory {
  id: string
  key: string
  name: string
  isActive: boolean
  listingCount?: number
}

export interface CampusLocation {
  id: string
  name: string
  isActive: boolean
  listingCount?: number
}

export interface ListingReport {
  id: string
  reason: 'INAPPROPRIATE' | 'MISLEADING' | 'SPAM' | 'OTHER'
  details: string | null
  status: 'PENDING' | 'DISMISSED' | 'ACTIONED'
  createdAt: string
  listing: {
    id: string
    title: string
    category: string
    location: string
    status: ListingStatus
    isResolved: boolean
    archivedAt: string | null
  }
  reporter: { name: string }
}

export interface ManagedStudent {
  id: string
  name: string
  email: string
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
  accountStatus: 'ACTIVE' | 'SUSPENDED'
  createdAt: string
}

export interface AdminActivity {
  id: string
  adminName: string
  action: string
  targetType: string
  targetId: string | null
  summary: string
  createdAt: string
}
