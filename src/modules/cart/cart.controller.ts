import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { JwtAuthGuard } from 'src/common/guards/jwtAuth.guard';
import { GetUser } from 'src/common/decorators/getUser.decorator';
import { AddToCartDto } from './dto/addToCart.dto';
import { throwError } from 'rxjs';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get('')
  @UseGuards(JwtAuthGuard)
  async fetchUserCart(@GetUser() user: any) {
    const userId = user.userId;
    return this.cartService.getCart(userId);
  }

  @Post('/add')
  @UseGuards(JwtAuthGuard)
  async addtoCart(@GetUser() user: any, @Body() dto: AddToCartDto) {
    const userId = user.userId;
    if (!userId) throw new BadRequestException('userid is required');
    return this.cartService.addToCart(userId, dto);
  }

  @Post('/clear')
  @UseGuards(JwtAuthGuard)
  async clearCart(@GetUser() user: any) {
    const userId = user.userId;
    if (!userId) throw new BadRequestException('userid is required');
    return this.cartService.clearCart(userId);
  }
}

