import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SeatLayout, SeatLayoutDocument } from '../../infrastructure/database/schemas/seatlayout-seat-bookings/SeatLayout.schema';
import { VenueOwnerProfile, VenueOwnerProfileDocument } from '../../infrastructure/database/schemas/venue-owner-profile.schema';

@Injectable()
export class VenueOwnerIdMigrationService {
  constructor(
    @InjectModel(SeatLayout.name)
    private seatLayoutModel: Model<SeatLayoutDocument>,
    @InjectModel(VenueOwnerProfile.name)
    private venueOwnerProfileModel: Model<VenueOwnerProfileDocument>,
  ) {}

  /**
   * Migrate layouts that have User IDs as venueOwnerId to use VenueOwnerProfile IDs
   * This is a one-time migration for existing data
   */
  async migrateVenueOwnerIds(): Promise<{ migrated: number; errors: string[] }> {
    console.log('Starting venue owner ID migration...');
    
    const errors: string[] = [];
    let migrated = 0;

    try {
      // Get all layouts that have a venueOwnerId
      const layouts = await this.seatLayoutModel.find({ 
        venueOwnerId: { $exists: true, $ne: null },
        isDeleted: { $ne: true }
      });

      console.log(`Found ${layouts.length} layouts with venueOwnerId`);

      for (const layout of layouts) {
        try {
          // Check if this venueOwnerId points to a VenueOwnerProfile
          const profile = await this.venueOwnerProfileModel.findById(layout.venueOwnerId);
          
          if (!profile) {
            // This might be a User ID, try to find the profile by user field
            const profileByUser = await this.venueOwnerProfileModel.findOne({ 
              user: layout.venueOwnerId 
            });
            
            if (profileByUser) {
              console.log(`Migrating layout ${layout._id} from user ID ${layout.venueOwnerId} to profile ID ${profileByUser._id}`);
              
              // Update the layout to use the profile ID
              await this.seatLayoutModel.updateOne(
                { _id: layout._id },
                { venueOwnerId: profileByUser._id }
              );
              
              // Add layout to profile's layouts array if not already there
              await this.venueOwnerProfileModel.updateOne(
                { _id: profileByUser._id },
                { $addToSet: { layouts: layout._id } }
              );
              
              migrated++;
            } else {
              errors.push(`No profile found for layout ${layout._id} with venueOwnerId ${layout.venueOwnerId}`);
            }
          } else {
            // Already pointing to a profile, just ensure it's in the layouts array
            await this.venueOwnerProfileModel.updateOne(
              { _id: profile._id },
              { $addToSet: { layouts: layout._id } }
            );
            console.log(`Layout ${layout._id} already has correct profile ID, ensured it's in layouts array`);
          }
        } catch (error) {
          errors.push(`Error processing layout ${layout._id}: ${error.message}`);
        }
      }

      console.log(`Migration completed. Migrated: ${migrated}, Errors: ${errors.length}`);
      return { migrated, errors };

    } catch (error) {
      const errorMsg = `Migration failed: ${error.message}`;
      console.error(errorMsg);
      return { migrated: 0, errors: [errorMsg] };
    }
  }
}