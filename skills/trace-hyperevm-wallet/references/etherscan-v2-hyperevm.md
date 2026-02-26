# Etherscan V2 for HyperEVM (chainid=999)

This note captures practical usage details for HyperEVM tracing with Etherscan V2.

## Core base and auth

- Base URL: `https://api.etherscan.io/v2/api`
- HyperEVM selector: `chainid=999`
- Auth: `apikey=<YOUR_KEY>`

Reference pages:
- `https://docs.etherscan.io/introduction`
- `https://docs.etherscan.io/supported-chains`
- `https://docs.etherscan.io/resources/rate-limits`
- `https://docs.etherscan.io/resources/common-error-messages`

## Free tier notes (from docs)

- Free tier allows up to 100,000 calls/day and 5 calls/second.
- Some endpoints are marked "historical"; docs note historical endpoints are throttled to 2 calls/second.
- API key is required for reliable access.

## HyperEVM-relevant account endpoints

Normal tx history:

```text
module=account
action=txlist
address=<0x...>
startblock=0
endblock=99999999
page=1
offset=100
sort=desc
chainid=999
apikey=<key>
```

Internal tx history:

```text
module=account
action=txlistinternal
address=<0x...>
startblock=0
endblock=99999999
page=1
offset=100
sort=desc
chainid=999
apikey=<key>
```

ERC-20 token transfers:

```text
module=account
action=tokentx
address=<0x...>
startblock=0
endblock=99999999
page=1
offset=100
sort=desc
chainid=999
apikey=<key>
```

Native balance:

```text
module=account
action=balance
address=<0x...>
tag=latest
chainid=999
apikey=<key>
```

Returned value is raw wei. Convert with:
- `HYPE = WEI / 10^18`
- `WEI = HYPE * 10^18`

## Common operational guards

- Handle `status=0` with `result=No transactions found` as empty data, not an error.
- Surface rate-limit and key errors clearly.
- Keep page sizes conservative and paginate.
- Do not assume Etherscan identity labels map to real-world identity.
