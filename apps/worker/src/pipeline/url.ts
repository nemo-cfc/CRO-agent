import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UrlRejected extends Error {}

/** Add a scheme if missing, drop the fragment, reject anything that is not http(s). */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new UrlRejected('Enter a website address.');

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UrlRejected(`"${input}" is not a valid web address.`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlRejected('Only http and https addresses can be audited.');
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    throw new UrlRejected(`"${url.hostname}" does not look like a domain name.`);
  }

  url.hash = '';
  return url;
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === '::1' || s === '::') return true;
  if (s.startsWith('fe80')) return true; // link-local
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // unique local
  // IPv4-mapped: ::ffff:10.0.0.1
  const mapped = s.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPrivateV4(mapped[1]);
  return false;
}

/**
 * SSRF guard. The URL comes from an untrusted user, and this worker sits inside
 * a private network with a cloud metadata endpoint at 169.254.169.254 — so
 * resolve the hostname and refuse anything that is not a public address.
 *
 * This is not airtight against a DNS-rebinding attacker (the browser resolves
 * independently, after this check). For a prototype it is the right level; if
 * this ever faces the open internet, put the worker's egress behind an explicit
 * allowlist proxy rather than hardening this function.
 */
export async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname;

  if (isIP(host)) {
    const bad = isIP(host) === 4 ? isPrivateV4(host) : isPrivateV6(host);
    if (bad) throw new UrlRejected('That address is not publicly reachable.');
    return;
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new UrlRejected('That address is not publicly reachable.');
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UrlRejected(`Could not find a site at ${host}.`);
  }

  if (addresses.length === 0) throw new UrlRejected(`Could not find a site at ${host}.`);

  for (const { address, family } of addresses) {
    const priv = family === 4 ? isPrivateV4(address) : isPrivateV6(address);
    if (priv) throw new UrlRejected('That address resolves to a private network.');
  }
}

/** A selected product must belong to the store and pass the same public-host validation. */
export async function validateProductUrl(store: URL, input?: string | null): Promise<string | undefined> {
  if (input == null) return undefined;
  if (typeof input !== 'string') throw new UrlRejected('Invalid product URL.');
  const product = normalizeUrl(input);
  if (product.username || product.password || product.hostname.replace(/^www\./i, '').toLowerCase() !== store.hostname.replace(/^www\./i, '').toLowerCase()) throw new UrlRejected('Choose a product from the same store.');
  await assertPublicHost(product);
  return product.toString();
}
