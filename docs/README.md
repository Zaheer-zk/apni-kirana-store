# Apni Kirana Store — Documentation

Welcome to the Apni Kirana Store documentation. This is a hyperlocal delivery platform for kirana, grocery, and pharmacy stores in South Asia — think Uber Eats, but for your neighbourhood store.

## Table of Contents

| Doc | Description |
| --- | --- |
| [Getting Started](./getting-started.md) | Spin up the entire stack locally in under 10 minutes. |
| [Architecture](./architecture.md) | High-level system architecture, data model, and core flows. |
| [Docker Setup](./docker-setup.md) | Container topology, networking, common commands, and troubleshooting. |
| [API Reference](./api-reference.md) | REST endpoints across all 7 route groups, with example requests and responses. |
| [Socket Events](./socket-events.md) | Realtime WebSocket reference — rooms, events, lifecycle. |
| [Database Schema](./database-schema.md) | Prisma models, relations, indexes, enums, ERD. |
| [Customer App](./customer-app.md) | The Expo React Native app shoppers use. |
| [Driver App](./driver-app.md) | The Expo React Native app delivery partners use. |
| [Store Portal](./store-portal.md) | The Expo React Native app store owners use. |
| [Admin Dashboard](./admin-dashboard.md) | The Next.js 15 dashboard used by operations / admins. |
| [Matching Algorithm](./matching-algorithm.md) | Deep dive into store matching and driver assignment logic. |
| [Notifications](./notifications.md) | DB + FCM notifications, events, and token management. |
| [Deployment](./deployment.md) | Production deployment to a cheap Ubuntu VPS, with TLS and CI/CD. |
| [Troubleshooting](./troubleshooting.md) | Quick fixes for the most common dev environment issues. |

## System at a glance

- **Backend** — Node.js + Express + Prisma + PostgreSQL + Redis + BullMQ + Socket.io + Firebase FCM
- **Customer App** — Expo React Native (browse, cart, checkout, live tracking)
- **Driver App** — Expo React Native (online/offline, deliveries, GPS)
- **Store Portal** — Expo React Native (inventory, accept/reject orders)
- **Admin Dashboard** — Next.js 15 (approvals, analytics, settings)

## New to the project?

Read in this order:

1. [Getting Started](./getting-started.md) — get it running.
2. [Architecture](./architecture.md) — understand how the pieces fit together.
3. [Database Schema](./database-schema.md) — see how data is modelled.
4. [API Reference](./api-reference.md) — explore the surface area.
