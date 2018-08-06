'use strict';
angular.module('copayApp.services').factory('shapeshiftService', function ($http, $interval, $log, lodash, moment, ongoingProcess, shapeshiftApiService, storageService, configService, incomingData, platformInfo, servicesService) {
  var root = {};
  root.ShiftState = 'Shift';
  root.coinIn = '';
  root.coinOut = '';
  root.withdrawalAddress = '';
  root.returnAddress = '';
  root.amount = '';
  root.marketData = {};
  root.withdrawalAddress = function (address) {
    root.withdrawalAddress = address;
  };
  root.returnAddress = function (address) {
    root.returnAddress = address;
  };
  root.amount = function (amount) {
    root.amount = amount;
  };
  root.coinIn = function (coinIn) {
    root.coinIn = coinIn.toUpperCase();
  };
  root.coinOut = function (coinOut) {
    root.coinOut = coinOut.toUpperCase();
  };

  root.getMarketDataIn = function (coin) {
    if (coin === root.coinOut) return root.getMarketData(root.coinOut, root.coinIn);
    return root.getMarketData(coin, root.coinOut);
  };
  root.getMarketDataOut = function (coin) {
    if (coin === root.coinIn) return root.getMarketData(root.coinOut, root.coinIn);
    return root.getMarketData(root.coinIn, coin);
  };
  root.getMarketData = function (coinIn, coinOut, cb) {
    root.coinIn = coinIn;
    root.coinOut = coinOut;
    if (root.coinIn === undefined || root.coinOut === undefined) return;
    shapeshiftApiService
        .marketInfo(root.coinIn, root.coinOut)
        .then(function (marketData) {
          root.marketData = marketData;
          root.rateString = root.marketData.rate.toString() + ' ' + coinOut.toUpperCase() + '/' + coinIn.toUpperCase();
          if (cb) {
            cb(marketData);
          }
        });
  };

  /*shapeshiftApiService.coins().then(function(coins){
      root.coins = coins;
      root.coinIn = coins['BTC'].symbol;
      root.coinOut = coins['BCH'].symbol;
      root.getMarketData(root.coinIn, root.coinOut);
  });*/

  root.coins = {
    'BTC': {name: 'Bitcoin', symbol: 'BTC'},
    'BCH': {name: 'Bitcoin Cash', symbol: 'BCH'}
  };

  function checkForError(data) {
    if (data.error) return true;
    return false;
  }

  root.shiftIt = function (coinIn, coinOut, withdrawalAddress, returnAddress, cb) {
    ongoingProcess.set('connectingShapeshift', true);
    root.withdrawalAddress(withdrawalAddress);
    root.returnAddress(returnAddress);
    var validate = shapeshiftApiService.ValidateAddress(withdrawalAddress, coinOut);
    validate.then(function (valid) {
      var tx = ShapeShift();
      var coin;
      console.log("Starting");
      tx.then(function (txData) {
        console.log("Got txData", txData);
        if (txData['fixedTxData']) {
          txData = txData.fixedTxData;
          if (checkForError(txData)) return;
          //console.log(txData)
          var coinPair = txData.pair.split('_');
          txData.depositType = coinPair[0].toUpperCase();
          txData.withdrawalType = coinPair[1].toUpperCase();
          coin = root.coins[txData.depositType].name.toLowerCase();

          txData.depositQR = coin + ":" + txData.deposit + "?amount=" + txData.depositAmount;

          root.txFixedPending = true;

        } else if (txData['normalTxData']) {

          txData = txData.normalTxData;
          if (checkForError(txData)) return;
          coin = root.coins[txData.depositType.toUpperCase()].name.toLowerCase();
          txData.depositQR = coin + ":" + txData.deposit;

        } else if (txData['cancelTxData']) {

          if (checkForError(txData.cancelTxData)) return;
          if (root.txFixedPending) {
            root.txFixedPending = false;
          }
          root.ShiftState = 'Shift';
          return;
        }
        root.depositInfo = txData;
        //console.log(root.marketData);
        //console.log(root.depositInfo);
        var sendAddress = txData.depositQR;
        if (sendAddress && sendAddress.indexOf('bitcoin cash') >= 0)
          sendAddress = sendAddress.replace('bitcoin cash', 'bitcoincash');

        ongoingProcess.set('connectingShapeshift', false);

        root.ShiftState = 'Cancel';
        root.GetStatus();
        root.txInterval=$interval(root.GetStatus, 8000);

        var shapeshiftData = {
          coinIn: coinIn,
          coinOut: coinOut,
          toWalletId: root.toWalletId,
          minAmount: root.marketData.minimum,
          maxAmount: root.marketData.maxLimit,
          orderId: root.depositInfo.orderId,
          toAddress: txData.deposit
        };
        //
        // if (incomingData.redir(sendAddress, 'shapeshift', shapeshiftData)) {
          ongoingProcess.set('connectingShapeshift', false);
          // return;
        // }
        cb(shapeshiftData);

      });
    })
  };

  function ShapeShift() {
    if (root.ShiftState === 'Cancel') return shapeshiftApiService.CancelTx(root);
    if (parseFloat(root.amount) > 0) return shapeshiftApiService.FixedAmountTx(root);
    return shapeshiftApiService.NormalTx(root);
  }

  root.GetStatus = function () {
    var address = root.depositInfo.deposit
    shapeshiftApiService.GetStatusOfDepositToAddress(address).then(function (data) {
      root.DepositStatus = data;
      if (root.DepositStatus.status === 'complete') {
        $interval.cancel(root.txInterval);
        root.depositInfo = null;
        root.ShiftState = 'Shift'
      }
    });
  };

  var servicesItem = {
    name: 'shapeshift',
    title: 'Shapeshift',
    icon: 'icon-shapeshift',
    sref: 'tabs.shapeshift',
  };

  var register = function () {
    servicesService.register(servicesItem);
  };
  register();
  return root;
});
