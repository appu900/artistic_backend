import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ArtistProfile,
  ArtistProfileDocument,
} from 'src/infrastructure/database/schemas/artist-profile.schema';
import {
  Cart,
  CartDocument,
  CartItem,
  CartItemDocument,
} from 'src/infrastructure/database/schemas/cart.schema';

@Injectable()
export class CartRepository {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(CartItem.name)
    private readonly cartItemModel: Model<CartItemDocument>,
    @InjectModel(ArtistProfile.name)
    private readonly artistProfileModel: Model<ArtistProfileDocument>,
  ) {}

  async findUserCart(userId: Types.ObjectId) {
    const cart = await this.cartModel
      .findOne({ userId })
      .populate({
        path: 'items',
        model: 'CartItem',
        populate: [
          {
            path: 'artistId',
            model: 'ArtistProfile',
            select: 'stageName profileImage user',
          },
          {
            path: 'selectedEquipmentPackages',
            model: 'EquipmentPackage',
            select: 'name totalPrice items',
            populate: {
              path: 'items.equipmentId',
              select: 'name pricePerDay images',
            },
          },
          {
            path: 'selectedCustomPackages',
            model: 'CustomEquipmentPackage',
            select: 'name totalPricePerDay items',
            populate: {
              path: 'items.equipmentId',
              select: 'name pricePerDay images',
            },
          },
        ],
      });
    if (!cart) {
      return {
        message: 'no cart found for this user',
      };
    }
    return cart;
  }

  async createCartIfNotExists(userId: Types.ObjectId) {
    const cart = await this.cartModel.findOne({ userId });
    if (cart) return cart;
    return this.cartModel.create({ userId, items: [] });
  }

  async addItem(userId: Types.ObjectId, itemData: Partial<CartItem>) {
    const artistId = itemData.artistId;
    console.log('artistId type', typeof itemData.artistId);
    const artist: ArtistProfileDocument | null =
      await this.artistProfileModel.findOne({
        user: itemData.artistId?.toString(),
      });
    itemData.artistId = artist
      ? (artist._id as Types.ObjectId)
      : (artistId as Types.ObjectId);
    const item = await this.cartItemModel.create({ ...itemData, userId });
    const cart = await this.createCartIfNotExists(userId);
    cart.items.push(item.id);
    await cart.save();
    return item;
  }

  async removeItem(userId: Types.ObjectId, itemId: Types.ObjectId) {
    const cart = await this.cartModel.findOne({ userId });
    if (!cart) return null;
    cart.items = cart.items.filter((id) => id.toString() != itemId.toString());
    await cart.save();
    await this.cartItemModel.findByIdAndDelete(itemId);
    return cart;
  }

  async clearCart(userId: Types.ObjectId) {
    const cart = await this.cartModel.findOne({ userId });
    if (!cart) return;
    await this.cartItemModel.deleteMany({ _id: { $in: cart.items } });
    cart.items = [];
    await cart.save();
  }

  async deleteCartItemsByIds(ids: Types.ObjectId[], session?: any) {
    return this.cartItemModel
      .deleteMany({ _id: { $in: ids } })
      .session(session);
  }

  async removeAllItemsFromCart(userId: Types.ObjectId, session?: any) {
    const cart = await this.cartModel.findOne({ userId }).session(session);
    if (!cart) return;
    await this.cartItemModel
      .deleteMany({ _id: { $in: cart.items } })
      .session(session);
    cart.items = [];
    await cart.save({ session });
  }
}
