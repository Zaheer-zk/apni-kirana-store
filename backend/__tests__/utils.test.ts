/**
 * Pure-unit tests for the utility modules.
 * These do not need DB or Redis, but the global setup is harmless when present.
 */
import { haversineDistance, getBoundingBox } from '../src/utils/geo';
import { signAccessToken, verifyAccessToken } from '../src/utils/jwt';
import { generateOtp } from '../src/utils/otp';
import jwt from 'jsonwebtoken';

describe('haversineDistance', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineDistance(28.6139, 77.209, 28.6139, 77.209)).toBeCloseTo(0, 5);
  });

  it('returns ~1150 km between Delhi and Mumbai', () => {
    // Delhi 28.6139, 77.209 — Mumbai 19.0760, 72.8777
    const d = haversineDistance(28.6139, 77.209, 19.076, 72.8777);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1200);
  });

  it('is symmetric', () => {
    const a = haversineDistance(10, 20, 30, 40);
    const b = haversineDistance(30, 40, 10, 20);
    expect(a).toBeCloseTo(b, 8);
  });
});

describe('getBoundingBox', () => {
  it('produces min/max around the centre', () => {
    const box = getBoundingBox(28.6139, 77.209, 5);
    expect(box.minLat).toBeLessThan(28.6139);
    expect(box.maxLat).toBeGreaterThan(28.6139);
    expect(box.minLng).toBeLessThan(77.209);
    expect(box.maxLng).toBeGreaterThan(77.209);
  });

  it('the box edges are roughly within radius distance from the centre', () => {
    const lat = 28.6139;
    const lng = 77.209;
    const radius = 5;
    const box = getBoundingBox(lat, lng, radius);

    expect(haversineDistance(lat, lng, box.maxLat, lng)).toBeCloseTo(radius, 0);
    expect(haversineDistance(lat, lng, lat, box.maxLng)).toBeCloseTo(radius, 0);
  });
});

describe('JWT roundtrip', () => {
  const payload = { id: 'user-1', role: 'CUSTOMER' as const, phone: '9000000001' };

  it('signs and verifies', () => {
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.id).toBe(payload.id);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.phone).toBe(payload.phone);
  });

  it('throws on invalid token', () => {
    expect(() => verifyAccessToken('garbage.token.value')).toThrow();
  });

  it('throws on a token signed with a different secret', () => {
    const bad = jwt.sign(payload, 'wrong-secret');
    expect(() => verifyAccessToken(bad)).toThrow();
  });

  it('throws on an expired token', () => {
    const expired = jwt.sign(payload, process.env['JWT_ACCESS_SECRET']!, {
      expiresIn: '-1s',
    });
    expect(() => verifyAccessToken(expired)).toThrow();
  });
});

describe('generateOtp', () => {
  it('returns a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
      const n = parseInt(otp, 10);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});
