#!/bin/bash
# 富化看门狗：沙箱会静默杀后台进程，崩溃自愈最多 20 轮；日志出现"完成:"即停
cd /mnt/agents/output/app
for i in $(seq 1 20); do
  npx tsx db/crawler-enrich.ts >> crawler-enrich.log 2>&1
  tail -5 crawler-enrich.log | grep -q "完成:" && break
  sleep 5
done
