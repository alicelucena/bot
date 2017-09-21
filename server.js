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

//Dinheiro restante em bitcoin
var BTCbalance = 0;

start();

function start() {

    // Veja quanto de dinheiro eu tenho para começarmos a procurar mercado.
    bittrex.getbalance({ currency: 'BTC' }, function(data, err) {
        if (!err) {
            BTCbalance = data.result.Available;
            console.log("SEU SALDO ATUAL É: " + BTCbalance);
            console.log("HORA DE PROCURAR MERCADO");
            procurarMercado();
        }
        else {
            console.log("ERRO AO PEGAR O BALANCE NO START");
            console.log(err);
            setTimeout(() => start(), 1000);
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
        setTimeout(() => start(), 10000);
    }
}

// Procurando um mercado para inventir
function findMarket(callback) {

    bittrex.getmarketsummaries(function(data, err) {

        var BTCmarkets = data.result.filter((m) => m.MarketName.split("-")[0] == "BTC");

        if (!err) {
            buySellCompare(BTCmarkets, callback);
        }
        // Erro
        else {
            console.log("Erro ao tentar pegar a lista de mercados - getsummaries");
            console.log(err);
            setTimeout(() => findMarket(callback), 50);
        }
    });
}


//Comparar se o mercado é bom mesmo para comprar
function buySellCompare(listaMercado, callback, indice, melhorMarket) {

    if (!indice) {
        indice = 0;
    }
    var percentual = 0.05;
    var market = listaMercado[indice];
    //    console.log("Comparando a razao entre compra e venda de " + market.MarketName);

    if (!allocatedMarket.hasOwnProperty(market.MarketName)) {
        bittrex.getorderbook({ market: market.MarketName, depth: 100, type: 'both' }, function(data, err) {

            if (err) {
                console.log(err);
                setTimeout(() => buySellCompare(listaMercado, callback, indice, melhorMarket), 50);
                return;
            }
            market.buy = data.result.buy;
            market.sell = data.result.sell;

            if (market.buy[0] && market.sell[0]) {
                var valorCompra = market.buy[0].Rate;
                var valorVenda = market.sell[0].Rate;
                var valorMedio = (valorCompra + valorVenda) / 2;

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

                if (proporcao > 3 && (!melhorMarket || proporcao > melhorMarket.proporcao)) {
                    melhorMarket = market;
                    console.log("Melhor market do momento " + melhorMarket.MarketName + " Proporcao " + proporcao);
                }

                if (indice == listaMercado.length - 1) {
                    if (melhorMarket) {
                        // como saber se o market esta em manutençao?
                        console.log("MELHOR MARKET ENCONTRADO " + melhorMarket.MarketName + " PROPORCAO " + melhorMarket.proporcao);
                        callback(melhorMarket);
                    }
                    else {
                        console.log("Não existem markets bons no mmomento. Favor aguardar.");
                        setTimeout(() => findMarket(callback), 100);
                    }

                }
                else {
                    setTimeout(() => buySellCompare(listaMercado, callback, indice + 1, melhorMarket), 50);
                }
            }
            else {
                console.log("market fora do ar " + market.MarketName);
                setTimeout(() => buySellCompare(listaMercado, callback, indice + 1, melhorMarket), 50);

            }
        });

    }
    else {
        console.log("Mercado já alocado");
        setTimeout(() => buySellCompare(listaMercado, callback, indice + 1, melhorMarket), 50);
    }

}


// investindo no mercado encontrado
function useMarket(market) {
    allocatedMarket[market.MarketName] = true;
    console.log("Usando o market para compra " + market.MarketName);
    var balanceToUse = Math.min(BTCbalance, 0.001);
    BTCbalance = BTCbalance - balanceToUse;
    var price = market.Ask;
    var qtd = Math.floor((balanceToUse / price) * 100000000) / 100000000;
    var sellPrice = price * 1.03;
    console.log("balance " + balanceToUse + " price de compra " + price + " provavel price de venda " + sellPrice);

    setTimeout(() => {
        bittrex.buylimit({ market: market.MarketName, quantity: qtd, rate: price }, function(data, err) {
            if (!err) {
                var id = data.result.uuid;
                console.log('Comprou com sucesso na ordem' + id);
                pegaOrdem(id, vender);
            }
            else {
                console.log("Erro na hora de colocar a ordem de compra.");
                console.log(err);
                BTCbalance = BTCbalance + balanceToUse;
                delete allocatedMarket[market.MarketName];
            }
        });
        procurarMercado();
    }, 100);
}


// Olhando se a compra ou a venda foi realizada
function pegaOrdem(id, callback, timeout) {
    if (!timeout) {
        timeout = 100;
    }

    bittrex.getorder({ uuid: id }, function(data, err) {
        if (!err && !data.result.IsOpen) {
            callback(data.result);
        }
        else {
            //            console.log("Ordem provavelmente aberta. Aberta? " + data.result.IsOpen);
            if (err) {
                console.log(err);
            }
            setTimeout(() => pegaOrdem(id, callback, timeout), timeout);
        }
    });
}

// Vendendo a moeda
function vender(order) {
    var quant = order.Quantity - order.QuantityRemaining;

    if (quant > 0) {
        var sellPrice = order.PricePerUnit * 1.03;
        console.log("Colocando ordem de venda " + order.Exchange + " price: " + sellPrice);

        setTimeout(() => {
            bittrex.selllimit({ market: order.Exchange, quantity: quant, rate: sellPrice }, function(data, err) {
                if (!err) {
                    pegaOrdem(data.result.uuid, function(order) {
                        console.log("Vendido com sucesso " + order.Exchange);
                        delete allocatedMarket[order.Exchange];
                        BTCbalance = BTCbalance + order.Price;
                    }, 2000);
                }
                else {
                    console.log("Erro no callback da venda " + err);
                    setTimeout(() => vender(order), 100);
                }
            });
        }, 100);

    }
    else {
        console.log("Quantidade para vender é igual ou menor a zero")
    }
}
