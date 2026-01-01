# Global Configuration Analysis

## Overview
This document identifies all hardcoded default values in the project that should be moved to a global configuration store accessible from the admin panel.

---

## 🔍 Hardcoded Values Found

### 1. **Subscription Pricing** (Currently in `subscriptionService.ts`)
**Location:** `backend/src/services/subscription/subscriptionService.ts` (lines 26-117)

**Values:**
- Basic Monthly: `$29.99`
- Basic Yearly: `$299.99`
- Pro Monthly: `$59.99`
- Pro Yearly: `$599.99`
- Enterprise Monthly: `$99.99`
- Enterprise Yearly: `$999.99`

**Should be configurable:**
- ✅ All subscription plan prices (monthly & yearly)
- ✅ Max accounts per plan
- ✅ Plan features (copyTrading, remoteControl, templates, rulesEngine, multiMaster, apiAccess)

---

### 2. **Trial System Configuration** (Currently in `constants.ts`)
**Location:** `backend/src/config/constants.ts` (lines 46-51)

**Values:**
- Trial Duration: `3 days`
- Trial Masters: `1`
- Trial Slaves: `1`

**Should be configurable:**
- ✅ Trial duration (days)
- ✅ Trial master account limit
- ✅ Trial slave account limit
- ✅ Enable/Disable trial globally
- ✅ Enable/Disable trial for all users (bulk)
- ✅ Enable/Disable trial for specific user groups

---

### 3. **Grace Period Configuration** (Currently in `constants.ts`)
**Location:** `backend/src/config/constants.ts` (line 54)

**Values:**
- Grace Period Days: `5 days`

**Should be configurable:**
- ✅ Grace period duration (days after expiry before moving to BASIC tier)

---

### 4. **Base Tier Limits** (Currently in `constants.ts`)
**Location:** `backend/src/config/constants.ts` (lines 31-44)

**Values:**
- BASIC: `0 masters, 0 slaves`
- EA_LICENSE: `1 master, 2 slaves`
- FULL_ACCESS: `3 masters, 10 slaves`

**Should be configurable:**
- ✅ Masters per tier (BASIC, EA_LICENSE, FULL_ACCESS)
- ✅ Slaves per tier (BASIC, EA_LICENSE, FULL_ACCESS)

---

### 5. **Default Subscription Renewal Period** (Hardcoded in multiple places)
**Locations:**
- `subscriptionService.ts` (lines 502, 737)
- `invoiceService.ts` (line 69)

**Values:**
- Default Renewal Period: `30 days`

**Should be configurable:**
- ✅ Default subscription renewal period (days)
- ✅ Default invoice due date (days)

---

### 6. **Client Discount Default** (Hardcoded in multiple places)
**Locations:**
- `User.ts` model (line 160): default `5%`
- `subscriptionService.ts` (lines 465, 1053): fallback `5%`
- `paymentController.ts` (line 47): fallback `5%`

**Values:**
- Default Client Discount: `5%`

**Should be configurable:**
- ✅ Default client discount percentage
- ✅ Enable/Disable client discount globally
- ✅ Enable/Disable client discount for all users (bulk)
- ✅ Enable/Disable client discount for specific user groups

---

### 7. **Special Discount/Offer System**
**Current Implementation:**
- Individual user special discounts exist
- No global offer system

**Should be configurable:**
- ✅ Enable/Disable special offers globally
- ✅ Set global promotional discount percentage
- ✅ Set global promotional discount expiry date
- ✅ Set global promotional discount description
- ✅ Apply global offer to all users (bulk)
- ✅ Apply global offer to specific user groups

---

### 8. **Add-On Pricing** (Not found - may need to be added)
**Currently:**
- Add-ons can be added but pricing is not clear

**Should be configurable:**
- ✅ Price per additional master account
- ✅ Price per additional slave account
- ✅ Add-on billing cycle (monthly/yearly)

---

### 9. **EA Subscription Defaults** (Not explicitly configured)
**Current Implementation:**
- Users can have additional masters/slaves
- Default values are 0

**Should be configurable:**
- ✅ Default EA subscription master count (for new users)
- ✅ Default EA subscription slave count (for new users)

---

### 10. **Other Hardcoded Values**
**Found in various models:**
- Invoice default quantity: `1` (Invoice.ts line 97)
- Command default priority: `5` (Command.ts line 137)
- CopyLink default multiplier: `1.0` (CopyLink.ts line 49)
- CopyLink default priority: `1` (CopyLink.ts line 82)
- MT5Account default lot size: `1.0` (MT5Account.ts line 134)
- MT5Account default max lot: `100.0` (MT5Account.ts line 140)
- MT5Account default min lot: `0.01` (MT5Account.ts line 144)
- MT5Account default slippage: `10` (MT5Account.ts line 188)
- Subscription default quantity: `1` (Subscription.ts line 77)

**Note:** These model defaults may not need to be configurable globally, but should be reviewed.

---

## 📋 Recommended Global Configuration Store Structure

### Database Model: `GlobalConfig`
```typescript
{
  // Subscription Pricing
  subscriptionPricing: {
    basic: { monthly: number, yearly: number, maxAccounts: number },
    pro: { monthly: number, yearly: number, maxAccounts: number },
    enterprise: { monthly: number, yearly: number, maxAccounts: number },
    features: {
      basic: { copyTrading, remoteControl, templates, rulesEngine, multiMaster, apiAccess },
      pro: { ... },
      enterprise: { ... }
    }
  },
  
  // Trial System
  trial: {
    enabled: boolean,
    durationDays: number,
    masters: number,
    slaves: number,
    enabledForAllUsers: boolean,
    enabledForGroups: string[] // user group IDs or names
  },
  
  // Grace Period
  gracePeriod: {
    days: number
  },
  
  // Base Tier Limits
  baseTierLimits: {
    BASIC: { masters: number, slaves: number },
    EA_LICENSE: { masters: number, slaves: number },
    FULL_ACCESS: { masters: number, slaves: number }
  },
  
  // Default Renewal Period
  defaultRenewalPeriod: {
    days: number
  },
  
  // Client Discount
  clientDiscount: {
    enabled: boolean,
    defaultPercentage: number,
    enabledForAllUsers: boolean,
    enabledForGroups: string[]
  },
  
  // Global Offers/Special Discounts
  globalOffers: {
    enabled: boolean,
    currentOffer: {
      percentage: number,
      expiryDate: Date,
      description: string,
      appliedToAllUsers: boolean,
      appliedToGroups: string[]
    }
  },
  
  // Add-On Pricing
  addOnPricing: {
    masterPrice: number,
    slavePrice: number,
    billingCycle: 'monthly' | 'yearly'
  },
  
  // EA Subscription Defaults
  eaDefaults: {
    defaultMasters: number,
    defaultSlaves: number
  },
  
  // Metadata
  lastUpdated: Date,
  lastUpdatedBy: string // admin user ID
}
```

---

## 🎯 Implementation Plan

### Phase 1: Database Model & Service
1. Create `GlobalConfig` model
2. Create `GlobalConfigService` with get/set methods
3. Initialize default values on first run
4. Add migration script to populate initial values

### Phase 2: Backend API
1. Create `GET /api/admin/config` - Get all config
2. Create `PUT /api/admin/config` - Update config (full or partial)
3. Create `GET /api/admin/config/:section` - Get specific section
4. Create `PUT /api/admin/config/:section` - Update specific section
5. Add validation for all config values
6. Add history logging for config changes

### Phase 3: Replace Hardcoded Values
1. Replace all hardcoded values with `GlobalConfigService` calls
2. Update `subscriptionService.ts` to use config
3. Update `constants.ts` to use config (or remove if not needed)
4. Update all controllers/services that use hardcoded values

### Phase 4: Frontend Admin UI
1. Create admin config page (`/dashboard/admin/config`)
2. Add sections for each config category
3. Add form validation
4. Add enable/disable toggles
5. Add bulk apply options (for trial, discounts, offers)
6. Add user group selection for targeted configs

### Phase 5: Testing & Validation
1. Test all config changes
2. Verify backward compatibility
3. Test bulk operations
4. Test user group targeting

---

## 🔐 Security Considerations

1. **Admin Only Access:** All config endpoints must require admin role
2. **Validation:** All config values must be validated (ranges, types, etc.)
3. **History Logging:** All config changes must be logged with admin info
4. **Backup:** Consider versioning config changes for rollback capability
5. **Rate Limiting:** Prevent too frequent config updates

---

## 📝 Notes

- Some model defaults (like CopyLink multiplier) may not need to be globally configurable
- Consider caching config values in memory for performance
- Config changes should trigger cache invalidation
- Consider adding config change notifications to admins
- May want to add config change approval workflow for critical changes

---

## ✅ Priority Items

**High Priority:**
1. Subscription pricing
2. Trial system configuration
3. Base tier limits
4. Grace period
5. Client discount defaults

**Medium Priority:**
6. Global offers/special discounts
7. Add-on pricing
8. Default renewal period

**Low Priority:**
9. EA subscription defaults
10. Model-level defaults (may not need global config)

---

## 🚀 Next Steps

1. Review this analysis
2. Confirm which items should be configurable
3. Create database model
4. Implement backend service and API
5. Replace hardcoded values
6. Create admin UI
7. Test thoroughly

