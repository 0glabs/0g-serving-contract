#!/bin/sh

result=$(curl -s -X POST --data '{
    "jsonrpc": "2.0",
    "method": "eth_getCode",
    "params": ["0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9", "latest"],
    "id": 1
}' -H "Content-Type: application/json" http://localhost:8545)

if [ -n "$result" ] && echo "$result" | jq -e 'if .result != null and .result != "0x" and (.result | test("^0x[0-9a-fA-F]+$")) then true else false end' > /dev/null; then
  echo "Valid result"
  exit 0
else
  echo "Invalid result"
  exit 1
fi