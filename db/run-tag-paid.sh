#!/bin/bash
cd /mnt/agents/output/app
for i in $(seq 1 12); do
  npx tsx db/tag-m4-paid.ts >> tag-paid.log 2>&1
  tail -8 tag-paid.log | grep -q "付费层结果" && break
  echo "--- 第 $i 次异常退出，5s 后自愈重启 ---" >> tag-paid.log
  sleep 5
done
