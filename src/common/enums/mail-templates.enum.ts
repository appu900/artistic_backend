export enum EmailTemplate {
  ARTIST_ONBOARD = 'artist-onboard',
  ARTIST_PROFILE_UPDATED = 'artist-profile-update',

  ADMIN_ONBOARD = 'admin-onboard',

  EQUIPMENT_PROVIDER_ONBOARD = 'equipment-provider-onboard',
  VENUE_PROVIDER_ONBOARD = 'venue-provider-onboard',

  OTP_VERIFICATION = 'otp-verification',
  PASSWORD_RESET = 'password-reset',
  PASSWORD_CHANGE_OTP = 'password-change-otp',
  PASSWORD_CHANGE_CONFIRMATION = 'password-change-confirmation',
  
  BOOKING_CONFIRMATION = 'booking-confirmation',
  BOOKING_CANCELLED = 'booking-cancelled',
  VENUE_OWNER_ONBOARD = 'venue_owner',

  // Booking notification templates
  ARTIST_BOOKING_CONFIRMATION = 'artist-booking-confirmation',
  EQUIPMENT_PROVIDER_NOTIFICATION = 'equipment-provider-notification',
  CUSTOMER_BOOKING_RECEIPT = 'customer-booking-receipt'
}
