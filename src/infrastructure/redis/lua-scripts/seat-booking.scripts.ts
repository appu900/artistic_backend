/**
 * Redis Lua Scripts for Atomic Seat Booking Operations
 * 
 * These scripts provide atomic operations for seat booking to prevent race conditions.
 * All operations use Redis SETNX and SET with TTL for reliable locking.
 */

/**
 * Multi-Seat Hold Script
 * Atomically holds multiple seats with TTL
 * 
 * KEYS: seat lock keys (e.g., "seat_lock:event123:seat456")
 * ARGV[1]: user ID
 * ARGV[2]: hold duration in seconds (TTL)
 * ARGV[3]: current timestamp
 * 
 * Returns: 
 * - 1 if all seats were successfully locked
 * - 0 if any seat was already locked
 * - -1 for invalid input
 */
export const MULTI_SEAT_HOLD_SCRIPT = `
  local userId = ARGV[1]
  local ttl = tonumber(ARGV[2])
  local timestamp = ARGV[3]
  
  if not userId or not ttl or not timestamp then
    return -1
  end
  
  -- First pass: Check if all seats are available
  for i = 1, #KEYS do
    local existing = redis.call('GET', KEYS[i])
    if existing then
      -- Seat is already locked
      return 0
    end
  end
  
  -- Second pass: Lock all seats atomically
  for i = 1, #KEYS do
    local lockValue = userId .. ':' .. timestamp
    redis.call('SET', KEYS[i], lockValue, 'EX', ttl)
  end
  
  return 1
`;

/**
 * Table Booking Script
 * Atomically books a table and all its associated seats
 * 
 * KEYS[1]: table lock key (e.g., "table_lock:event123:table456")
 * KEYS[2..n]: seat lock keys for all seats belonging to the table
 * ARGV[1]: user ID
 * ARGV[2]: hold duration in seconds
 * ARGV[3]: current timestamp
 * ARGV[4]: table ID
 * 
 * Returns:
 * - 1 if table and all seats were successfully locked
 * - 0 if table or any seat was already locked
 * - -1 for invalid input
 */
export const TABLE_BOOKING_SCRIPT = `
  local userId = ARGV[1]
  local ttl = tonumber(ARGV[2])
  local timestamp = ARGV[3]
  local tableId = ARGV[4]
  
  if not userId or not ttl or not timestamp or not tableId then
    return -1
  end
  
  -- Check table availability
  local tableKey = KEYS[1]
  local existingTable = redis.call('GET', tableKey)
  if existingTable then
    return 0
  end
  
  -- Check all seat availability
  for i = 2, #KEYS do
    local existing = redis.call('GET', KEYS[i])
    if existing then
      return 0
    end
  end
  
  -- Lock table and all seats
  local lockValue = userId .. ':' .. timestamp .. ':table:' .. tableId
  
  -- Lock the table itself
  redis.call('SET', tableKey, lockValue, 'EX', ttl)
  
  -- Lock all associated seats
  for i = 2, #KEYS do
    redis.call('SET', KEYS[i], lockValue, 'EX', ttl)
  end
  
  return 1
`;

/**
 * Release Locks Script
 * Atomically releases multiple seat/table locks for a specific user
 * 
 * KEYS: lock keys to release
 * ARGV[1]: user ID (only releases locks owned by this user)
 * ARGV[2]: current timestamp (for validation)
 * 
 * Returns: number of locks actually released
 */
export const RELEASE_LOCKS_SCRIPT = `
  local userId = ARGV[1]
  local timestamp = ARGV[2]
  local released = 0
  
  if not userId then
    return released
  end
  
  for i = 1, #KEYS do
    local lockValue = redis.call('GET', KEYS[i])
    if lockValue then
      -- Check if this lock belongs to the user
      local userPrefix = userId .. ':'
      if string.sub(lockValue, 1, string.len(userPrefix)) == userPrefix then
        redis.call('DEL', KEYS[i])
        released = released + 1
      end
    end
  end
  
  return released
`;

/**
 * Extend Hold Script
 * Extends the TTL of existing locks owned by a user
 * 
 * KEYS: lock keys to extend
 * ARGV[1]: user ID
 * ARGV[2]: new TTL in seconds
 * 
 * Returns: number of locks extended
 */
export const EXTEND_HOLD_SCRIPT = `
  local userId = ARGV[1]
  local newTtl = tonumber(ARGV[2])
  local extended = 0
  
  if not userId or not newTtl then
    return extended
  end
  
  for i = 1, #KEYS do
    local lockValue = redis.call('GET', KEYS[i])
    if lockValue then
      local userPrefix = userId .. ':'
      if string.sub(lockValue, 1, string.len(userPrefix)) == userPrefix then
        redis.call('EXPIRE', KEYS[i], newTtl)
        extended = extended + 1
      end
    end
  end
  
  return extended
`;

/**
 * Check Availability Script
 * Quickly checks availability of multiple seats without locking
 * 
 * KEYS: seat/table lock keys to check
 * 
 * Returns: array of availability (1 = available, 0 = locked)
 */
export const CHECK_AVAILABILITY_SCRIPT = `
  local availability = {}
  
  for i = 1, #KEYS do
    local lockValue = redis.call('GET', KEYS[i])
    if lockValue then
      availability[i] = 0  -- locked
    else
      availability[i] = 1  -- available
    end
  end
  
  return availability
`;

/**
 * Atomic Transfer Script
 * Transfers locks from temporary hold to confirmed booking
 * Used when converting holds to actual bookings
 * 
 * KEYS: lock keys to transfer
 * ARGV[1]: current user ID (must own the locks)
 * ARGV[2]: new lock value (booking confirmation ID)
 * ARGV[3]: new TTL (longer for confirmed bookings)
 * 
 * Returns: 
 * - 1 if all locks transferred successfully
 * - 0 if user doesn't own all the locks
 * - -1 for invalid input
 */
export const ATOMIC_TRANSFER_SCRIPT = `
  local userId = ARGV[1]
  local newLockValue = ARGV[2]
  local newTtl = tonumber(ARGV[3])
  
  if not userId or not newLockValue or not newTtl then
    return -1
  end
  
  -- First pass: Verify user owns all locks
  for i = 1, #KEYS do
    local lockValue = redis.call('GET', KEYS[i])
    if not lockValue then
      return 0  -- Lock doesn't exist
    end
    
    local userPrefix = userId .. ':'
    if string.sub(lockValue, 1, string.len(userPrefix)) ~= userPrefix then
      return 0  -- User doesn't own this lock
    end
  end
  
  -- Second pass: Transfer all locks
  for i = 1, #KEYS do
    redis.call('SET', KEYS[i], newLockValue, 'EX', newTtl)
  end
  
  return 1
`;

/**
 * Cleanup Expired Holds Script
 * Manually cleanup expired holds (backup to TTL)
 * Useful for monitoring and ensuring consistency
 * 
 * KEYS[1]: pattern for seat locks (e.g., "seat_lock:event123:*")
 * ARGV[1]: current timestamp
 * 
 * Returns: number of expired locks cleaned up
 */
export const CLEANUP_EXPIRED_SCRIPT = `
  local pattern = KEYS[1]
  local currentTime = tonumber(ARGV[1])
  local cleaned = 0
  
  if not pattern or not currentTime then
    return cleaned
  end
  
  local keys = redis.call('KEYS', pattern)
  
  for i = 1, #keys do
    local ttl = redis.call('TTL', keys[i])
    if ttl == -1 then  -- Key exists but no TTL set
      redis.call('DEL', keys[i])
      cleaned = cleaned + 1
    end
  end
  
  return cleaned
`;

/**
 * Batch Status Check Script
 * Get status of multiple seats/tables in one call
 * 
 * KEYS: lock keys to check
 * 
 * Returns: array of lock information [lockValue, TTL] for each key
 */
export const BATCH_STATUS_SCRIPT = `
  local results = {}
  
  for i = 1, #KEYS do
    local lockValue = redis.call('GET', KEYS[i])
    local ttl = redis.call('TTL', KEYS[i])
    
    if lockValue then
      results[i] = {lockValue, ttl}
    else
      results[i] = {nil, -2}  -- -2 means key doesn't exist
    end
  end
  
  return results
`;

export const LUA_SCRIPTS = {
  MULTI_SEAT_HOLD: MULTI_SEAT_HOLD_SCRIPT,
  TABLE_BOOKING: TABLE_BOOKING_SCRIPT,
  RELEASE_LOCKS: RELEASE_LOCKS_SCRIPT,
  EXTEND_HOLD: EXTEND_HOLD_SCRIPT,
  CHECK_AVAILABILITY: CHECK_AVAILABILITY_SCRIPT,
  ATOMIC_TRANSFER: ATOMIC_TRANSFER_SCRIPT,
  CLEANUP_EXPIRED: CLEANUP_EXPIRED_SCRIPT,
  BATCH_STATUS: BATCH_STATUS_SCRIPT,
} as const;