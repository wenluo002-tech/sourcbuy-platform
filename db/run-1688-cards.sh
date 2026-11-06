#!/bin/bash
# 1688 工厂搜索卡采集看门狗：单轮 LIMIT=500，断点续跑（cards_checked_at），剩余 0 即停
cd /mnt/agents/output/app
for i in $(seq 1 40); do
  if [ -f .1688-session-dead ]; then echo "SESSION-DEAD，看门狗停" >> factory-cards.log; break; fi
  DRY=0 LIMIT=500 npx tsx db/factory-cards.ts >> factory-cards.log 2>&1
  tail -3 factory-cards.log | grep -q "完成：无待采集行\|剩余 0" && break
  sleep 10
done
echo "watchdog done at $(date)" >> factory-cards.log
