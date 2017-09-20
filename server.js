var bittrex = require('node.bittrex.api');

// Variáveis da conta
bittrex.options({
    'apikey': process.env.APIKEY,
    'apisecret': process.env.APISECRET,
    stream: false,
    verbose: false,
    cleartext: false,
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

// Procuradno um mercado para inventir - maior volume
function findMarket(callback) {

    //tratar err depois
    bittrex.getmarketsummaries(function(data, err) {

        var BTCmarkets = data.result.filter((m) => m.MarketName.split("-")[0] == "BTC");

        if (data.success) {
            buySellCompare(BTCmarkets, callback);
        }
        // Erro
        else {
            console.log("Erro ao tentar achar o mercado com maior volume - getsummaries");
            console.log(err.message);
        }
    });
}

//Analisando se temos as condicoes necessarias para procurar um mercado
function procurarMercado() {
    if (BTCbalance > 0.0005) {
        findMarket(useMarket);
    }
    else {
        console.log("Quantidade de BTC muito baixa: " + BTCbalance);
        setTimeout(() => procurarMercado(), 10000);
    }
}

//Comparar se o mercado é bom mesmo para comprar
function buySellCompare(listaMercado, callback, indice, melhorMarket) {

    if (!indice) {
        indice = 0;
    }
    var percentual = 0.05;
    var market = listaMercado[indice];

    if (!allocatedMarket.hasOwnProperty(market.MarketName)) {
        bittrex.getorderbook({ market: market.MarketName, depth: 100, type: 'both' }, function(data, err) {
            market.buy = data.result.buy;
            market.sell = data.result.sell;

            var valorCompra = market.buy[0].Rate;           
            var valorVenda = market.sell[0].Rate;
            var valorMedio = (valorCompra + valorVenda)/2

            var valorObjetivo = valorMedio * (1 - percentual);
            var totalMoedaCompra = 0;
            var qtdOrdemCompra = market.buy.length;

            for (var i = 0; i < qtdOrdemCompra; i++) {
                if (market.buy[i].Rate > valorObjetivo) {
                    totalMoedaCompra = totalMoedaCompra + market.buy[i].Quantity;
                }
                else {
                    break;
                }
            }

            var valorObjetivoVenda = valorMedio * (1 + percentual);
            var totalMoedaVenda = 0;

            var qtdOrdemVenda = market.sell.length;
            for (var i = 0; i < qtdOrdemVenda; i++) {
                if (market.sell[i].Rate < valorObjetivoVenda) {
                    totalMoedaVenda = totalMoedaVenda + market.sell[i].Quantity;
                }
                else {
                    break;
                }
            }

            var proporcao = totalMoedaCompra / totalMoedaVenda;
            market.proporcao = proporcao;

            if (!melhorMarket || proporcao > melhorMarket.proporcao) {
                melhorMarket = market;
            }

            if (indice == listaMercado.length - 1) {
                callback(melhorMarket);
            }
            else {
                setTimeout(() => buySellCompare(listaMercado, callback, indice + 1, melhorMarket), 10);
            }
        });
    }
    else {
        setTimeout(() => buySellCompare(listaMercado, callback, indice + 1, melhorMarket), 10);
    }
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
function pegaOrdem(id, callback, timeout) {
    if(!timeout) {
        timeout = 100;
    }
    
    bittrex.getorder({ uuid: id }, function(data, err) {
        if (!data.result.IsOpen) {
            callback(data.result);
        }
        else {
            console.log("Erro na hora de pegar a ordem. Aberta?" + data.result.IsOpen);
            setTimeout(() => pegaOrdem(id, callback, timeout),timeout);
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
        }, 2000);
    } else {
        console.log("erro na venda " + err);
    }
}
