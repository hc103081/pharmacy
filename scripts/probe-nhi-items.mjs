import https from 'node:https'

const VERCEL_DOMAIN = process.argv[2] || 'pharmacy-nextjs-v2.vercel.app'

function request({ hostname, path, method, headers }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.status, text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.setTimeout(10_000, () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    if (method === 'POST') req.write('{"delay":1800}')
    req.end()
  })
}

;(async () => {
  const path = '/api/test-lookup-simulated'
  const t0 = Date.now()
  const { status, text } = await request({
    hostname: VERCEL_DOMAIN,
    path,
    method: 'POST',
    headers: { host: VERCEL_DOMAIN, 'content-type': 'application/json' },
  })
  const duration = Date.now() - t0
  console.log(`${path} => ${duration}ms (status ${status})`)
  console.log(text.slice(0, 200))
  console.log('pre-transform false => 直接反映網路 + Vercel Edge + handler 真實耗時')
})().catch((err) => {
  console.error('probe failed', err)
  process.exit(1)
})
