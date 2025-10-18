export interface PricingEntry {
  hours: number;
  amount: number;
}

export interface TimeSlotPricing {
  hour: number; // 0-23 (24-hour format)
  rate: number; // Price for this specific hour
}

export interface ArtistPricingData {
  privatePricing?: PricingEntry[];
  publicPricing?: PricingEntry[];
  workshopPricing?: PricingEntry[];
  internationalPricing?: PricingEntry[];
  
  // New time slot pricing
  privateTimeSlotPricing?: TimeSlotPricing[];
  publicTimeSlotPricing?: TimeSlotPricing[];
  workshopTimeSlotPricing?: TimeSlotPricing[];
  internationalTimeSlotPricing?: TimeSlotPricing[];
  
  // Base rates for time slots
  basePrivateRate?: number;
  basePublicRate?: number;
  baseWorkshopRate?: number;
  baseInternationalRate?: number;
  
  // Pricing mode
  pricingMode?: 'duration' | 'timeslot';
}
