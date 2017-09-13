var bittrex = require('node.bittrex.api');

// Variáveis da conta
bittrex.options({
    'apikey': "184ff2dbd1b84b12b272f384eb677856",
    'apisecret': "e0148461330e4d019688d0ea6e919b54",
});

//Mercados que já comprei algo com o bitcoin
var allocatedMarket = {};
var lowerPrice = {};

//Dinheiro restante em bitcoin
var BTCbalance = 0;

start();

function start() {

    // Veja quanto de dinheiro eu tenho para começarmos a procurar mercado.
    bittrex.getbalance({ currency: 'BTC' }, function(data, err) {
        if (data.success) {
            BTCbalance = data.result.Available;
            procurarMercado();
        }
        else {
            console.log(err.message);
            setTimeout(() => start(), 1000);
        }
    });
}

//Analisando se temos as condicoes necessarias para procurar um mercado
function procurarMercado() {
    if (BTCbalance > 0.0007) {
        findMarket(useMarket);
    }
    else {
        console.log("Quantidade de BTC muito baixa: " + BTCbalance);
        setTimeout(() => procurarMercado(), 10000);
    }
}

// Procuradno um mercado para inventir - maior volume
function findMarket(callback) {

    //tratar err depois
    bittrex.getmarketsummaries(function(data, err) {
        
        var BTCmarkets = data.result.filter((m)=>m.MarketName.split("-")[0]=="BTC");
        
        if (data.success) {
            var marketMax = BTCmarkets[0];
            

            for (var i = 1; i < BTCmarkets.length; i++) {
                var atual = BTCmarkets[i];
                console.log("PORCENTAGEM   " + atual.OpenBuyOrders/atual.OpenSellOrders )
                if (atual.OpenBuyOrders >= 1,1 * atual.OpenSellOrders) {
                    if (atual.BaseVolume > marketMax.BaseVolume && !allocatedMarket.hasOwnProperty(atual.MarketName)) {
                        marketMax = atual;
                    }
                }
            }

            console.log("mercado " + marketMax)
            callback(marketMax);
        }
        // Erro
        else {
            console.log("Erro ao tentar achar o mercado com maior volume - getsummaries");
            console.log(err.message);
        }
    });
}

// investindo no mercado encontrado
function useMarket(market) {
    allocatedMarket[market.MarketName] = 1;
    console.log("mkt " + market.MarketName);
    var balanceToUse = Math.min(BTCbalance, 0.0005);
    BTCbalance = BTCbalance - balanceToUse;
    var price = market.Ask;
    var qtd = Math.floor((balanceToUse / price) * 100000000) / 100000000;

    console.log("balance " + balanceToUse + " price" + price + "qtd " + qtd);

    bittrex.buylimit({ market: market.MarketName, quantity: qtd, rate: price }, buyCallback);
    procurarMercado();
}

// Retorno da funçao de compra
function buyCallback(data, err) {
    if (data.success) {
        var id = data.result.uuid;
        console.log('Comprou com sucesso na ordem' + id);
        pegaOrdem(id, vender);
    }
    else {
        console.log("Erro na hora de colocar a ordem de compra.");
        console.log(err.message);
    }
}

// Olhando se a compra ou a venda foi realizada
function pegaOrdem(id, callback) {
    bittrex.getorder({ uuid: id }, function(data, err) {
        if (!data.result.IsOpen) {
            callback(data.result);
        }
        else {
            console.log("Erro na hora de pegar a ordem. Aberta?" + data.result.IsOpen);
            setTimeout(() => pegaOrdem(id), 100);
        }
    });
}

// Vendendo a moeda
function vender(order) {
    var quant = order.Quantity - order.QuantityRemaining;

    if (quant > 0) {
        var sellPrice = order.PricePerUnit * 1.02;
        bittrex.selllimit({ market: order.Exchange, quantity: quant, rate: sellPrice }, sellCalback);
    }
    else {
        console.log("Quantidade para vender é igual ou menor a zero")
    }
}

// Uma vez que a venda foi realizada, preciso tirar do array e colocar o dinheiro de volta no BTCBalance
function sellCalback(data, err) {
    if (data.success) {
        pegaOrdem(data.result.uuid, function(order) {
            delete allocatedMarket[order.Exchange];
            BTCbalance = BTCbalance + order.Price;
        });
    }
}
