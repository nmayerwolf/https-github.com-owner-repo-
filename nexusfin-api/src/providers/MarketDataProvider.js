class MarketDataProvider {
  async getDailyBars(_symbols, _from, _to) {
    throw new Error('getDailyBars must be implemented by provider');
  }

  async getFundamentals(_symbols) {
    throw new Error('getFundamentals must be implemented by provider');
  }

  async getEarningsCalendar(_from, _to) {
    return [];
  }

  async getNews(_from, _to, _queryTags = []) {
    throw new Error('getNews must be implemented by provider');
  }
}

module.exports = { MarketDataProvider };
