#!/bin/bash
# SourcBuy 服务看门狗：每 15 秒探活一次，死了立即拉起。
# 前台「闪退」的环境根因是沙箱休眠/回收会杀进程；只要沙箱本身还活着，
# 这个循环就把服务随时拉回来。启动方式：
#   setsid nohup bash guard.sh > guard.log 2>&1 < /dev/null &
# 停服：先杀 guard.sh 进程，再杀 node dist/boot.js（否则会被重新拉起）。
cd "$(dirname "$0")"
# 11-19 修复：旧版单次 5s 超时就杀 node——jimp 大图/GC 占满事件循环时误杀健康服务。
# 现改：探 /api/healthz（轻量），15s 超时，连续 3 次失败才重启（真死最多 ~90s 拉起，抖动不杀）。
FAILS=0
while true; do
  if curl -s -o /dev/null --max-time 15 http://localhost:3200/api/healthz; then
    FAILS=0
  else
    FAILS=$((FAILS+1))
    echo "[$(date '+%F %T')] 探测失败 ${FAILS}/3" >> guard.log
  fi
  if [ "$FAILS" -ge 3 ]; then
    echo "[$(date '+%F %T')] 连续3次失败，重启服务" >> guard.log
    OLDPID=$(ps aux | grep "node dist/boot" | grep -v grep | awk '{print $2}')
    [ -n "$OLDPID" ] && kill $OLDPID 2>/dev/null && sleep 1
    NODE_ENV=production PORT=3200 nohup node dist/boot.js >> server.log 2>&1 &
    sleep 8
    if curl -s -o /dev/null --max-time 15 http://localhost:3200/api/healthz; then
      echo "[$(date '+%F %T')] 重启成功" >> guard.log
      FAILS=0
    else
      echo "[$(date '+%F %T')] 重启后仍不通，重建 dist 后再试" >> guard.log
      npm run build >> guard.log 2>&1
    fi
  fi
  sleep 15
done
