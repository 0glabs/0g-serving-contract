#!/bin/sh

npx hardhat node --no-deploy > /dev/null 2>&1 &

/bin/sh /usr/local/bin/deploy.sh &

wait