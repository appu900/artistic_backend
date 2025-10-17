export interface PricingEntry {
  hours: number;
  amount: number;
}

export interface ArtistPricingData {
  privatePricing?: PricingEntry[];
  publicPricing?: PricingEntry[];
  workshopPricing?: PricingEntry[];
  internationalPricing?: PricingEntry[];
}
