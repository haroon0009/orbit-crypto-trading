###
- there are few things we have to make sure that one ticker is can only be assign to one strategy of that particular exchange but we can use the same strategy with multiple ticker's 
- for the ui perspective it should be clean and give the details of all the active strategies information shouldn't be clustered 
- before we activate the bot lets call the one ticker for one strategy with one bot and i can name that bot whatever i want there should be clear ui how many bots are active with clear strategy name and pnl how many trades has been made etc
- before placing the order we should always add the tp and sl for that trade and i can assign minimum and maximum amount for that particular bot per trade and total capital (like 1000USDT is the capital for that bot and each trade can be placed with 100USDT - 200USDT ) and the leverage before activating the bots means all the information and validation must be done before activating the bot and also the timeframe should be set by me before activating the bot
- the main goal of this platform or bot is to make automated trades in high frequency with less capital 
- we should also keep the record of back testing and get the confidence how effective the following strategy will be and clear details of how many trades make profit and loss.
- there should also the option to deactivate the bot



### 
First strategy would be EMA 20 and EMA 50 like follow the trend/momentum where the market trend is for that our long and short signals would be when EMA 20 cross the EMA 50 and EMA 20 going upward thats our long signal and when EMA 20 cross the EMA 50 and EMA 20 is in downward trend then its the signal for short we should wait for the next candle to form  


###
- Difference between live, paper, back testing clear ui and logic
- Details about the bot and their live data
- A few things are missing when we activate the bot we should also see the logs and details that how many trades does this bot has made 


In the back testing and paper trades also implement the maker/taker/slippage fees as well  