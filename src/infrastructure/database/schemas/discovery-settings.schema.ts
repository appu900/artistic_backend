import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DiscoverySettingsDocument = DiscoverySettings & Document;

export const DISCOVERY_SETTINGS_KEY = 'default';

@Schema({ collection: 'discovery_settings' })
export class DiscoverySettings {
  @Prop({ required: true, unique: true, default: DISCOVERY_SETTINGS_KEY })
  key: string;

  @Prop({ required: true, default: 'Explore Artistic' })
  eyebrow: string;

  @Prop({ required: true, default: 'Discover unforgettable performances' })
  title: string;

  @Prop({
    required: true,
    default:
      'Photos and reels from artists, genres, and experiences curated for your next event.',
  })
  subtitle: string;
}

export const DiscoverySettingsSchema =
  SchemaFactory.createForClass(DiscoverySettings);
