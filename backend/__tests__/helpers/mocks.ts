/**
 * Reusable jest.mock factories. Import and call from individual test files,
 * or use the equivalent jest.mock() calls inline at the top of each file.
 *
 * NOTE: jest.mock() is hoisted, so prefer the inline form in each test file.
 * This file is kept as a documentation reference and as a place to share
 * mocked module shapes if needed.
 */

export const mockNotificationModule = () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
});

export const mockQueuesIndexModule = () => ({
  matchingQueue: { add: jest.fn().mockResolvedValue(undefined) },
  driverQueue: { add: jest.fn().mockResolvedValue(undefined) },
  startWorkers: jest.fn(),
  stopWorkers: jest.fn().mockResolvedValue(undefined),
});

export const mockQueuesQueuesModule = () => ({
  matchingQueue: { add: jest.fn().mockResolvedValue(undefined) },
  driverQueue: { add: jest.fn().mockResolvedValue(undefined) },
});

export const mockTwilioModule = () =>
  jest.fn(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({ sid: 'TEST_MESSAGE_SID' }),
    },
  }));

export const mockDriverServiceModule = () => ({
  assignDriverForOrder: jest.fn().mockResolvedValue(undefined),
});
