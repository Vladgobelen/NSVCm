#!/bin/sh
cd "/home/diver/sources/JS/NSVCm/"
j=$(date)
git add .
git commit -m "$1 $j"
git push git@github.com:Vladgobelen/NSVCm.git

