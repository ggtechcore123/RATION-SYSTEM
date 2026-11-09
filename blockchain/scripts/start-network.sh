#!/bin/bash
# Smart PDS Hyperledger Fabric Network Startup Script
set -e

echo "=========================================================="
echo " Starting Smart Indian PDS Hyperledger Fabric Test Network"
echo "=========================================================="

# Check docker
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed or not in PATH."
    echo "The Node.js backend fallback cryptographic ledger is active."
    exit 0
fi

docker-compose -f ../network/docker-compose.yaml down --volumes --remove-orphans
docker-compose -f ../network/docker-compose.yaml up -d

echo "Fabric containers successfully started:"
docker ps --filter "name=pds"

echo "Channel: pdschannel"
echo "Smart Contract: smartpds v1.0"
echo "Ready for chaincode deployment."

