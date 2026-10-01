from .models import Asset

CATALOG = [
    Asset(symbol="AAPL", name="Apple Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="NVDA", name="NVIDIA Corporation", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="MU", name="Micron Technology, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="MRVL", name="Marvell Technology, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="MSFT", name="Microsoft Corporation", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="AMZN", name="Amazon.com, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="GOOGL", name="Alphabet Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="META", name="Meta Platforms, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="TSLA", name="Tesla, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="AMD", name="Advanced Micro Devices, Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="AVGO", name="Broadcom Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="PLTR", name="Palantir Technologies Inc.", type="stock", exchange="NASDAQ", currency="USD"),
    Asset(symbol="SPY", name="SPDR S&P 500 ETF Trust", type="etf", exchange="NYSE ARCA", currency="USD"),
    Asset(symbol="QQQ", name="Invesco QQQ Trust", type="etf", exchange="NASDAQ", currency="USD"),
    Asset(symbol="IWM", name="iShares Russell 2000 ETF", type="etf", exchange="NYSE ARCA", currency="USD"),
    Asset(symbol="VTI", name="Vanguard Total Stock Market ETF", type="etf", exchange="NYSE ARCA", currency="USD"),
    Asset(symbol="GLD", name="SPDR Gold Shares", type="etf", exchange="NYSE ARCA", currency="USD"),
    Asset(symbol="TLT", name="iShares 20+ Year Treasury Bond ETF", type="etf", exchange="NASDAQ", currency="USD"),
    Asset(symbol="^GSPC", name="S&P 500 Index", type="index", exchange="SNP", currency="USD"),
    Asset(symbol="^IXIC", name="NASDAQ Composite", type="index", exchange="NASDAQ", currency="USD"),
    Asset(symbol="^NDX", name="NASDAQ 100 Index", type="index", exchange="NASDAQ", currency="USD"),
    Asset(symbol="^DJI", name="Dow Jones Industrial Average", type="index", exchange="DJI", currency="USD"),
    Asset(symbol="^VIX", name="CBOE Volatility Index", type="index", exchange="CBOE", currency="USD"),
    *[Asset(symbol=f"{symbol}-USD", name=name, type="crypto", exchange="COINBASE", currency="USD")
      for symbol, name in [("BTC", "Bitcoin"), ("ETH", "Ethereum"), ("SOL", "Solana"),
                           ("XRP", "XRP"), ("DOGE", "Dogecoin"), ("ADA", "Cardano"),
                           ("LINK", "Chainlink"), ("AVAX", "Avalanche"), ("LTC", "Litecoin")]],
]
ASSETS = {asset.symbol: asset for asset in CATALOG}
ALIASES = {asset.symbol.removesuffix("-USD"): asset.symbol for asset in CATALOG if asset.type == "crypto"}
ALIASES.update({"SPX": "^GSPC", "S&P500": "^GSPC", "VIX": "^VIX", "NDX": "^NDX"})


def normalize_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper()
    return ALIASES.get(normalized, normalized)


def search_catalog(query: str) -> list[Asset]:
    query = query.strip().upper()
    canonical = normalize_symbol(query)
    matches = [a for a in CATALOG if query in a.symbol or query in a.name.upper() or a.symbol == canonical]
    return sorted(matches, key=lambda a: (a.symbol != canonical, not a.symbol.startswith(query), a.symbol))
