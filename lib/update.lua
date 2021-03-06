 -- Input parameters
 --   KEYS[1] redis key for global hash
 --   KEYS[2] redis key for channel list
 --   KEYS[3] redis key for event ID sorted-set
 --   KEYS[4] redis key for event hash
 --   ARGV[1] channel ID
 --   ARGV[2] current time (equivalent to TIME, in msec)
 --   ARGV[3] max number of events
 -- Output parameters
 --   {array} Events
 --   {number} Next (suggested) interval in milliseconds.
redis.call("HSETNX", KEYS[1], "gracePeriod", 20)
redis.call("HSETNX", KEYS[1], "baseInterval", 1000)
redis.call("HSETNX", KEYS[1], "eventId", 0)
local events = {}
local chId = ARGV[1]
local now = tonumber(ARGV[2])
local numMaxEvents = tonumber(ARGV[3])
local gracePeriod = tonumber(redis.call("HGET", KEYS[1], "gracePeriod"))
local baseInterval = tonumber(redis.call("HGET", KEYS[1], "baseInterval"))
local numChs = tonumber(redis.call("LLEN", KEYS[2]))
local defaultInterval = numChs * baseInterval

redis.log(redis.LOG_DEBUG,"numChs=" .. numChs)

if numMaxEvents > 0 then
    local evIds = redis.call("ZRANGEBYSCORE", KEYS[3], 0, now, "LIMIT", 0, numMaxEvents)
    if #evIds > 0 then
        redis.call("ZREMRANGEBYRANK", KEYS[3], 0, #evIds - 1)
        for i=1, #evIds do
            table.insert(events, redis.call("HGET", KEYS[4], evIds[i]))
            redis.call("HDEL", KEYS[4], evIds[i])
        end
        if redis.call("LINDEX", KEYS[2], numChs-1) == chId then
            if numChs > 1 then
                redis.call("RPOPLPUSH", KEYS[2], KEYS[2])
            end
            redis.call("HDEL", KEYS[1], "expiresAt")
        end
    end
end

local numEvents = redis.call("ZCARD", KEYS[3])
if numEvents == 0 then
    redis.call("HDEL", KEYS[1], "expiresAt")
else
    local notify = true
    local nexp = tonumber(redis.call("ZRANGE", KEYS[3], 0, 0, "WITHSCORES")[2])
    if redis.call("HEXISTS", KEYS[1], "expiresAt") == 1 then
        local cexp = tonumber(redis.call("HGET", KEYS[1], "expiresAt"))
        if cexp > nexp and cexp - nexp > gracePeriod then
            redis.call("HDEL", KEYS[1], "expiresAt")
        else
            notify = false
        end
    end
    if numChs > 0 and notify then
        local interval = 0
        if nexp > now then
            interval = nexp - now
        end
        if interval + gracePeriod < defaultInterval then
            while numChs > 0 do
                chId = redis.call("LINDEX", KEYS[2], numChs-1)
                local ret = redis.call("PUBLISH", chId, '{"interval":' .. interval .. '}')
                if ret > 0 then
                    redis.call("HSET", KEYS[1], "expiresAt", nexp);
                    break
                end
                redis.call("RPOP", KEYS[2]);
                numChs = tonumber(redis.call("LLEN", KEYS[2]));
            end
        end
    end
end

return {events, defaultInterval}
