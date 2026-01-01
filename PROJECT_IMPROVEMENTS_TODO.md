# MT5 Copy Trading - Project Improvements & TODO

## 🔴 CRITICAL - Missing Admin Features

### 1. User Management (Admin Panel)
**Status:** ❌ NOT IMPLEMENTED
**Priority:** HIGH

#### 1.1 User Edit/Update
- [ ] **Backend API:** `PUT /api/admin/users/:userId`
  - Allow admin to edit user information:
    - Name
    - Email (with validation)
    - Role (admin/client/viewer)
    - isActive status
  - Add validation for email uniqueness
  - Log changes in UserHistory
  - Location: `backend/src/controllers/userController.ts` (new method)
  - Location: `backend/src/routes/user.routes.ts` (new route)

- [ ] **Frontend UI:** Admin user edit modal/form
  - Edit user details in admin subscriptions page
  - Add "Edit User Info" button next to "View Details"
  - Modal with form fields (name, email, role, isActive)
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`
  - Location: `frontend/app/dashboard/admin/users/[userId]/page.tsx`

#### 1.2 User Delete
- [ ] **Backend API:** `DELETE /api/admin/users/:userId`
  - Soft delete or hard delete option
  - Before deletion:
    - Delete all MT5 accounts
    - Delete all copy links
    - Cancel Stripe subscription (if exists)
    - Delete payment history (or mark as deleted)
    - Log deletion in UserHistory
  - Prevent admin from deleting themselves
  - Location: `backend/src/controllers/userController.ts` (new method)
  - Location: `backend/src/routes/user.routes.ts` (new route)

- [ ] **Frontend UI:** Delete user button with confirmation
  - Add "Delete User" button in admin user detail page
  - Confirmation modal with warning
  - Show what will be deleted (accounts, links, etc.)
  - Location: `frontend/app/dashboard/admin/users/[userId]/page.tsx`
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

#### 1.3 User Block/Unblock
- [ ] **Backend API:** `POST /api/admin/users/:userId/block` and `POST /api/admin/users/:userId/unblock`
  - Toggle `isActive` status
  - When blocked:
    - Prevent login
    - Optionally disable EA access
    - Send notification email (optional)
  - Log block/unblock action in UserHistory
  - Location: `backend/src/controllers/userController.ts` (new methods)
  - Location: `backend/src/routes/user.routes.ts` (new routes)

- [ ] **Frontend UI:** Block/Unblock toggle button
  - Show current status (Active/Blocked)
  - Toggle button in admin user detail page
  - Toggle button in admin subscriptions list
  - Visual indicator (red badge for blocked)
  - Location: `frontend/app/dashboard/admin/users/[userId]/page.tsx`
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

---

## 🟡 HIGH PRIORITY - User Dashboard Improvements

### 2. User Profile Management
**Status:** ⚠️ PARTIALLY IMPLEMENTED
**Priority:** HIGH

- [ ] **Email Change:** Allow users to change email
  - Backend: Add email change endpoint with verification
  - Frontend: Add email change form in settings
  - Send verification email to new address
  - Update Stripe customer email if exists
  - Location: `backend/src/controllers/userController.ts`
  - Location: `frontend/app/dashboard/settings/page.tsx`

- [ ] **Profile Picture:** Add profile picture upload
  - Backend: File upload endpoint (use multer or cloud storage)
  - Frontend: Image upload component
  - Store in cloud storage (AWS S3, Cloudinary, etc.)
  - Location: `backend/src/controllers/userController.ts`
  - Location: `frontend/app/dashboard/settings/page.tsx`

- [ ] **Two-Factor Authentication (2FA):** Add 2FA support
  - Backend: TOTP implementation (speakeasy)
  - Frontend: QR code generation and verification
  - Optional but recommended for security
  - Location: `backend/src/services/auth/authService.ts`
  - Location: `frontend/app/dashboard/settings/page.tsx`

---

## 🟡 HIGH PRIORITY - Admin Dashboard Improvements

### 3. Admin Dashboard Overview
**Status:** ❌ NOT IMPLEMENTED
**Priority:** HIGH

- [ ] **Admin Dashboard Page:** Create dedicated admin dashboard
  - Total users count
  - Active subscriptions count
  - Revenue statistics (total, monthly, yearly)
  - Recent registrations
  - Expiring subscriptions (next 7 days)
  - Recent payments
  - System health metrics
  - Location: `frontend/app/dashboard/admin/page.tsx` (NEW)

- [ ] **Admin Navigation:** Improve admin navigation
  - Add admin dashboard link
  - Better organization of admin pages
  - Quick actions sidebar
  - Location: `frontend/app/dashboard/layout.tsx`

### 4. Admin User Search & Filters
**Status:** ⚠️ BASIC IMPLEMENTATION
**Priority:** MEDIUM

- [ ] **Advanced Search:** Enhance search functionality
  - Search by email, name, user ID
  - Search by subscription tier
  - Search by status (active/blocked/expired)
  - Search by date range (registration date)
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

- [ ] **Bulk Operations:** Add bulk actions
  - Bulk block/unblock users
  - Bulk delete users (with confirmation)
  - Bulk tier update
  - Export selected users to CSV
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

- [ ] **Export Functionality:** Export user data
  - Export users list to CSV/Excel
  - Export user details with all related data
  - Export payment history
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

---

## 🟢 MEDIUM PRIORITY - UI/UX Improvements

### 5. Toast Notifications
**Status:** ⚠️ PARTIALLY IMPLEMENTED
**Priority:** MEDIUM

- [ ] **Replace all `alert()` calls with toast notifications**
  - Settings page uses `alert()` - replace with toast
  - Other pages may have alerts - audit and replace
  - Use react-hot-toast consistently
  - Location: `frontend/app/dashboard/settings/page.tsx`
  - Location: All dashboard pages

### 6. Loading States
**Status:** ⚠️ PARTIALLY IMPLEMENTED
**Priority:** MEDIUM

- [ ] **Improve loading indicators**
  - Add skeleton loaders for tables
  - Add loading states for all async operations
  - Better error states with retry buttons
  - Location: All dashboard pages

### 7. Error Handling
**Status:** ⚠️ BASIC IMPLEMENTATION
**Priority:** MEDIUM

- [ ] **Better error messages**
  - User-friendly error messages
  - Error boundaries for React components
  - Retry mechanisms for failed requests
  - Location: All pages

### 8. Responsive Design
**Status:** ⚠️ PARTIALLY IMPLEMENTED
**Priority:** MEDIUM

- [ ] **Mobile optimization**
  - Test all pages on mobile devices
  - Improve table responsiveness (horizontal scroll or cards)
  - Better mobile navigation
  - Location: All pages

---

## 🟢 MEDIUM PRIORITY - Backend Improvements

### 9. API Validation
**Status:** ⚠️ PARTIALLY IMPLEMENTED
**Priority:** MEDIUM

- [ ] **Enhanced validation**
  - Add validation for all admin endpoints
  - Email format validation
  - Input sanitization
  - Rate limiting for admin endpoints
  - Location: `backend/src/middleware/validator.ts`
  - Location: All controllers

### 10. Audit Logging
**Status:** ✅ IMPLEMENTED (but can be improved)
**Priority:** LOW

- [ ] **Enhanced audit trail**
  - Log all admin actions (edit, delete, block)
  - Log user profile changes
  - Better search/filter in history page
  - Export audit logs
  - Location: `backend/src/services/history/historyService.ts`
  - Location: `frontend/app/dashboard/admin/history/page.tsx`

### 11. Security Enhancements
**Status:** ⚠️ BASIC IMPLEMENTATION
**Priority:** HIGH

- [ ] **Security improvements**
  - Add rate limiting for sensitive endpoints
  - Add IP whitelist for admin endpoints (optional)
  - Add request logging for admin actions
  - Add CSRF protection
  - Location: `backend/src/middleware/rateLimit.ts`
  - Location: `backend/src/middleware/auth.ts`

---

## 🔵 LOW PRIORITY - Nice to Have

### 12. Advanced Features
**Status:** ❌ NOT IMPLEMENTED
**Priority:** LOW

- [ ] **Email Notifications**
  - Welcome email on registration
  - Subscription expiry reminders
  - Payment confirmations
  - Account activity alerts
  - Location: `backend/src/services/email/` (NEW)

- [ ] **User Activity Dashboard**
  - Show user login history
  - Show last active time
  - Show device/browser info
  - Location: `frontend/app/dashboard/admin/users/[userId]/page.tsx`

- [ ] **Analytics Dashboard**
  - User growth charts
  - Revenue charts
  - Subscription tier distribution
  - Payment success rate
  - Location: `frontend/app/dashboard/admin/analytics/page.tsx` (NEW)

- [ ] **User Notes/Comments**
  - Allow admin to add notes to user accounts
  - Internal comments system
  - Location: `backend/src/models/User.ts` (add notes field)
  - Location: `frontend/app/dashboard/admin/users/[userId]/page.tsx`

- [ ] **User Tags/Labels**
  - Add tags to users (VIP, Test, etc.)
  - Filter users by tags
  - Location: `backend/src/models/User.ts` (add tags field)
  - Location: `frontend/app/dashboard/admin/subscriptions/page.tsx`

### 13. Performance Optimizations
**Status:** ⚠️ BASIC IMPLEMENTATION
**Priority:** LOW

- [ ] **Database indexing**
  - Review and optimize all indexes
  - Add compound indexes for common queries
  - Location: All models

- [ ] **Caching**
  - Add Redis caching for user lists
  - Cache subscription data
  - Cache license configs
  - Location: `backend/src/services/realtime/cacheService.ts`

- [ ] **Pagination improvements**
  - Implement cursor-based pagination
  - Better pagination UI
  - Location: All list pages

### 14. Testing
**Status:** ❌ NOT IMPLEMENTED
**Priority:** LOW

- [ ] **Unit tests**
  - Test all services
  - Test all controllers
  - Test utilities

- [ ] **Integration tests**
  - Test API endpoints
  - Test authentication flow
  - Test subscription flow

- [ ] **E2E tests**
  - Test user registration/login
  - Test admin user management
  - Test subscription purchase

---

## 📋 Implementation Checklist Summary

### Must Have (Critical)
1. ✅ User Edit (Admin) - Backend API + Frontend UI
2. ✅ User Delete (Admin) - Backend API + Frontend UI
3. ✅ User Block/Unblock (Admin) - Backend API + Frontend UI

### Should Have (High Priority)
4. ⚠️ Email Change (User)
5. ⚠️ Admin Dashboard Overview
6. ⚠️ Advanced Search & Filters
7. ⚠️ Toast Notifications (replace alerts)
8. ⚠️ Security Enhancements

### Nice to Have (Medium/Low Priority)
9. ⚠️ Profile Picture Upload
10. ⚠️ Two-Factor Authentication
11. ⚠️ Bulk Operations
12. ⚠️ Export Functionality
13. ⚠️ Email Notifications
14. ⚠️ Analytics Dashboard
15. ⚠️ User Notes/Comments
16. ⚠️ Performance Optimizations
17. ⚠️ Testing

---

## 🎯 Quick Start Guide

### Step 1: Implement Critical Features (User Management)
1. Create admin user management endpoints in backend
2. Add routes for user edit, delete, block/unblock
3. Create frontend UI components for these actions
4. Add proper validation and error handling
5. Test thoroughly

### Step 2: Improve User Dashboard
1. Add email change functionality
2. Replace all alerts with toast notifications
3. Improve loading states
4. Add better error handling

### Step 3: Enhance Admin Dashboard
1. Create admin dashboard overview page
2. Improve search and filters
3. Add bulk operations
4. Add export functionality

### Step 4: Polish & Optimize
1. Improve UI/UX
2. Add performance optimizations
3. Add security enhancements
4. Add testing

---

## 📝 Notes

- All admin endpoints should require `role: 'admin'` authentication
- All user management actions should be logged in UserHistory
- All destructive actions (delete, block) should have confirmation modals
- All API endpoints should have proper validation
- All frontend forms should have proper error handling
- Consider adding soft delete for users (mark as deleted instead of hard delete)
- Consider adding user roles beyond admin/client/viewer if needed

---

## 🔗 Related Files

### Backend
- `backend/src/controllers/userController.ts` - User management controller
- `backend/src/routes/user.routes.ts` - User routes
- `backend/src/services/auth/authService.ts` - Authentication service
- `backend/src/models/User.ts` - User model
- `backend/src/services/history/historyService.ts` - History service

### Frontend
- `frontend/app/dashboard/admin/subscriptions/page.tsx` - Admin subscriptions page
- `frontend/app/dashboard/admin/users/[userId]/page.tsx` - Admin user detail page
- `frontend/app/dashboard/admin/history/page.tsx` - Admin history page
- `frontend/app/dashboard/settings/page.tsx` - User settings page
- `frontend/lib/api.ts` - API client

---

**Last Updated:** 2025-01-28
**Status:** Ready for Implementation

