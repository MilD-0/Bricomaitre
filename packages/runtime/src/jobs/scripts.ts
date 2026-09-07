export const RELEASE_OWNED_KEY_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

export const WRITE_SNAPSHOT_SCRIPT = `
  if (redis.call('get', KEYS[1]) or '') ~= ARGV[6] then return false end
  local snapshot = cjson.decode(ARGV[1])
  if ARGV[7] == '1' then
    redis.call('set', KEYS[2], '1', 'EX', ARGV[2])
  end
  -- Re-encoding through cjson changes [] to {} and can round large numbers.
  local encoded = ARGV[1]
  if redis.call('exists', KEYS[2]) == 1 then
    encoded = ARGV[5]
  end
  redis.call('set', KEYS[1], encoded, 'EX', ARGV[2])
  local currentOwner = redis.call('get', KEYS[3])
  local currentOwnerScore = currentOwner and redis.call('zscore', KEYS[4], currentOwner)
  if not currentOwner or currentOwner == snapshot.id or not currentOwnerScore or tonumber(ARGV[3]) >= tonumber(currentOwnerScore) then
    redis.call('set', KEYS[3], snapshot.id, 'EX', ARGV[2])
  end
  redis.call('zadd', KEYS[4], ARGV[3], snapshot.id)
  redis.call('expire', KEYS[4], ARGV[2])
  if ARGV[4] == '1' then
    redis.call('zadd', KEYS[5], ARGV[3], snapshot.id)
    redis.call('expire', KEYS[5], ARGV[2])
  end
  return encoded
`;

export const CLAIM_SNAPSHOT_SCRIPT = `
  local function activeSnapshot(id)
    if not id then return nil end
    local raw = redis.call('get', ARGV[8] .. id)
    if not raw then return nil end
    local status = cjson.decode(raw).status
    if status == 'queued' or status == 'running' then return raw end
    return nil
  end
  local owned = activeSnapshot(redis.call('get', KEYS[3]))
  if owned then return owned end
  local active = activeSnapshot(redis.call('get', KEYS[6]))
  if active then return active end
  redis.call('set', KEYS[6], cjson.decode(ARGV[1]).id, 'EX', ARGV[2])
  ${WRITE_SNAPSHOT_SCRIPT}
`;
