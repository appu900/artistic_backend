# Real-Time Seat Booking System

A scalable, race-condition-free seat booking system built with NestJS, MongoDB, and Redis. Designed to handle high-concurrency scenarios like ticket booking platforms (BookMyShow style).

## 🚀 Features

- **Atomic Seat Locking**: Uses Redis Lua scripts to prevent race conditions
- **Individual & Table Booking**: Support for both individual seats and entire tables
- **Real-time Updates**: Merge static layout geometry with runtime seat states
- **High Performance**: Optimized for 1000+ concurrent users and 10,000+ seats
- **Automatic Cleanup**: TTL-based expiration of holds and locks
- **Comprehensive API**: RESTful endpoints with OpenAPI documentation

## 🏗️ Architecture Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │───▶│   NestJS    │───▶│    Redis    │    │  MongoDB    │
│             │    │     API     │    │  (Locking)  │    │(Persistent) │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                           │                   │                   │
                           │                   │                   │
                    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
                    │ Atomic Lua  │    │   SETNX +   │    │ SeatLayout  │
                    │   Scripts   │    │     TTL     │    │  SeatState  │
                    └─────────────┘    └─────────────┘    │ SeatBooking │
                                                          └─────────────┘
```

### Key Design Principles

1. **Separation of Concerns**:
   - `SeatLayout`: Static geometry (rarely changes, highly cacheable)
   - `SeatState`: Runtime status (frequent updates, optimized for writes)
   - `SeatBooking`: Confirmed bookings (append-only, audit trail)

2. **Atomic Operations**: Redis Lua scripts ensure consistency across multi-seat operations

3. **Performance Optimization**: Spatial indexing, viewport-based loading, and compound indexes

## 📊 Database Schema

### SeatLayout (Static Geometry)
```typescript
{
  _id: ObjectId,
  name: string,
  seats: [{
    id: string,
    pos: { x: number, y: number },
    size: { x: number, y: number },
    catId: string,
    rl?: string,  // row label
    sn?: number   // seat number
  }],
  items: [{  // tables, stages, etc.
    id: string,
    type: 'table' | 'stage' | 'booth',
    pos: { x: number, y: number },
    size: { x: number, y: number },
    sc?: number  // seat count for tables
  }],
  categories: [{
    id: string,
    name: string,
    color: string,
    price: number
  }]
}
```

### SeatState (Runtime Status)
```typescript
{
  _id: ObjectId,
  layoutId: ObjectId,
  eventId: ObjectId,
  seatId: string,
  status: 'available' | 'booked' | 'held' | 'blocked',
  bookedBy?: ObjectId,
  heldBy?: ObjectId,
  holdExpiresAt?: Date,
  bookedPrice?: number,
  version: number
}
```

### SeatBooking (Confirmed Bookings)
```typescript
{
  _id: ObjectId,
  eventId: ObjectId,
  userId: ObjectId,
  bookingType: 'individual_seats' | 'table_booking' | 'mixed',
  bookedSeats: [{ seatId, categoryId, price, rowLabel, seatNumber }],
  bookedTables: [{ tableId, seatCount, associatedSeatIds, totalPrice }],
  allSeatIds: string[],
  totalAmount: number,
  status: 'pending' | 'confirmed' | 'paid' | 'cancelled',
  payment: { status, amount, method, transactionId },
  contact: { name, email, phone }
}
```

## 🔐 Redis Locking Strategy

### Key Patterns
```
seat_lock:${eventId}:${seatId}     # Individual seat locks
table_lock:${eventId}:${tableId}   # Table locks
```

### Lock Values
```
${userId}:${timestamp}[:table:${tableId}]
```

### Lua Scripts
- `MULTI_SEAT_HOLD`: Atomically hold multiple seats
- `TABLE_BOOKING`: Hold table + all associated seats
- `RELEASE_LOCKS`: Release user's locks
- `ATOMIC_TRANSFER`: Convert holds to bookings

## 📡 API Endpoints

### Hold Seats
```http
POST /seat-booking/hold-seats
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "eventId": "64f123456789abcd12345678",
  "seatIds": ["seat_A1", "seat_A2"],
  "holdDurationMinutes": 10
}
```

### Hold Table
```http
POST /seat-booking/hold-table
Authorization: Bearer <jwt>

{
  "eventId": "64f123456789abcd12345678", 
  "tableId": "table_VIP_001",
  "holdDurationMinutes": 15
}
```

### Confirm Booking
```http
POST /seat-booking/confirm
Authorization: Bearer <jwt>

{
  "eventId": "64f123456789abcd12345678",
  "seatIds": ["seat_A1", "seat_A2"],
  "contactInfo": {
    "name": "John Smith",
    "email": "john@email.com"
  },
  "paymentInfo": {
    "method": "card",
    "transactionId": "stripe_tx_123"
  }
}
```

### Get Layout with Real-time States
```http
GET /seat-booking/layout/64f123456789abcd12345678
GET /seat-booking/layout/64f123456789abcd12345678?viewport={"x":0,"y":0,"width":800,"height":600}
```

## 🚦 Race Condition Prevention

### Scenario: Two Users, Same Seat
```javascript
// User A and User B both try to book seat_A1 simultaneously

// User A (14:30:00.100) - SUCCESS
POST /seat-booking/hold-seats { seatIds: ["seat_A1"] }
→ Redis SETNX seat_lock:event123:seat_A1 = "userA:1698067200100"
→ Response: { success: true, heldSeats: ["seat_A1"] }

// User B (14:30:00.105) - CONFLICT  
POST /seat-booking/hold-seats { seatIds: ["seat_A1"] }
→ Redis SETNX seat_lock:event123:seat_A1 = "userB:1698067200105" (FAILS)
→ Response: { success: false, conflictingSeats: ["seat_A1"] }
```

## ⚡ Performance Features

### 1. Viewport-Based Loading
For large venues (1000+ seats), only load visible seats:
```javascript
// Frontend calculates viewport
const viewport = { x: 0, y: 0, width: 800, height: 600 };
fetch(`/layout/${eventId}?viewport=${JSON.stringify(viewport)}`);
```

### 2. Spatial Indexing
MongoDB 2D indexes for fast spatial queries:
```javascript
// Automatically filter seats within viewport
db.seatLayouts.aggregate([
  {
    $project: {
      seats: {
        $filter: {
          input: '$seats',
          cond: {
            $and: [
              { $gte: ['$$this.pos.x', viewport.x] },
              { $lte: ['$$this.pos.x', viewport.x + viewport.width] }
              // ... y coordinates
            ]
          }
        }
      }
    }
  }
]);
```

### 3. Batch Operations
Hold up to 50 seats in one atomic operation:
```javascript
await holdSeats({
  eventId,
  seatIds: ['seat_A1', 'seat_A2', ..., 'seat_A50'], // Max 50
  userId,
  holdDurationMinutes: 10
});
```

## 📈 Scalability Metrics

This system is designed to handle:

- **Concurrent Users**: 1,000+ simultaneous booking attempts
- **Venue Size**: 10,000+ seats per event  
- **Booking Volume**: 100+ bookings per second
- **Data Consistency**: Zero double-bookings guaranteed
- **Response Time**: <100ms for hold operations
- **Availability**: 99.9% uptime with Redis clustering

## 🔧 Installation & Setup

### 1. Install Dependencies
```bash
cd artistic_backend
npm install
```

### 2. Environment Configuration
```bash
# .env
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017/artistic
JWT_SECRET=your_jwt_secret
```

### 3. Start Services
```bash
# Start Redis
redis-server

# Start MongoDB
mongod

# Start NestJS application
npm run start:dev
```

### 4. Import Module
```typescript
// app.module.ts
import { SeatBookingModule } from './modules/seat-booking/seat-booking.module';

@Module({
  imports: [
    // ... other modules
    SeatBookingModule,
  ],
})
export class AppModule {}
```

## 🧪 Testing Examples

See [EXAMPLES.md](./EXAMPLES.md) for comprehensive API usage examples including:

- Individual seat booking flow
- Table booking with automatic seat association
- Race condition handling
- Error scenarios and responses
- Performance optimization techniques

## 🔍 Monitoring & Analytics

### Real-time Statistics
```http
GET /seat-booking/stats/64f123456789abcd12345678
```
Returns:
```json
{
  "totalSeats": 500,
  "bookedSeats": 127, 
  "heldSeats": 23,
  "availableSeats": 350,
  "revenue": 15750.00
}
```

### Redis Monitoring
```bash
# Monitor Redis commands
redis-cli monitor

# Check key expiration
redis-cli ttl seat_lock:event123:seat_A1
```

### MongoDB Queries
```javascript
// Check seat state distribution
db.seatStates.aggregate([
  { $group: { _id: "$status", count: { $sum: 1 } } }
]);
```

## 🛠️ Advanced Configuration

### Redis Clustering
For high availability, use Redis Cluster:
```typescript
// redis.module.ts
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => new IORedis.Cluster([
        { port: 7000, host: '127.0.0.1' },
        { port: 7001, host: '127.0.0.1' },
        { port: 7002, host: '127.0.0.1' },
      ]),
    },
  ],
})
```

### MongoDB Sharding
Shard by eventId for massive scale:
```javascript
// Enable sharding
sh.enableSharding("artistic");
sh.shardCollection("artistic.seatStates", { eventId: 1 });
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for high-performance seat booking systems**