@echo off
cd /d "D:\NewProjects\Pingaksh\Saudagar\saudagar-backend"
pm2 start scheduler/gameResultScheduler.js --name "game-scheduler"
pause