#!/bin/bash

while true; do
    sh_count=$(pgrep -x "sh" -c)
    echo "Number of sh processes: $sh_count"
    
    if [ "$sh_count" -gt 1 ]; then
        if [ ! -f "/usr/src/app/deployed.txt" ]; then
            cd /usr/src/app || exit
            npx hardhat deploy --tags Serving --network hardhat
            if [ $? -eq 0 ]; then
                touch "deployed.txt"
                echo "Contracts deployed"
                exit 0
            else
                echo "Deployment failed, retrying..." >&2
            fi
        else
            echo "deployed.txt already exists"
        fi
    else
        echo "sh process count is not greater than 1"
    fi
    
    echo "waiting..."
    sleep 15
done