#!/bin/bash
set -e
[[ $EUID -ne 0 ]] && { echo "Run as root: sudo bash"; exit 1; }
curl -fsSL https://gfalgueras.github.io/arumu/arumu.repo \
  -o /etc/yum.repos.d/arumu.repo
dnf install -y arumu
echo "Arumu installed."
