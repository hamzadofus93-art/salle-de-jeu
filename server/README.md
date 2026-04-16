# Phoenix Snooker Server

Backend `Node.js + Express + Prisma + SQLite` pour le dashboard Phoenix.

## Setup

1. Copier `.env.example` vers `.env`
2. Installer les dependances :
   `npm install`
3. Generer Prisma :
   `npm run db:generate`
4. Creer la base locale :
   `npm run db:migrate`
5. Seed du premier compte sudo et des tables :
   `npm run db:seed`
6. Lancer le serveur :
   `npm run dev`

## Front Angular servi par Express

1. Construire le client Angular :
   `npm run build:client`
2. Demarrer l'application complete :
   `npm run start`

Tu peux aussi faire les deux d'un coup avec :
`npm run start:full`

Quand le build Angular existe dans `../client/dist/client/browser`, Express sert :
- l'interface Angular sur `/`
- les assets statiques du client
- l'API backend sur `/api`

## Structure

- `src/config` : config et donnees de base
- `src/controllers` : handlers HTTP
- `src/services` : logique metier
- `src/routes` : routes Express
- `src/middleware` : auth + erreurs
- `src/db` : client Prisma
- `prisma` : schema et seed

## Routes principales

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:accountId/status`
- `DELETE /api/accounts/:accountId`
- `GET /api/tables`
- `POST /api/tables`
- `POST /api/tables/:tableId/waiting-list`
- `DELETE /api/tables/:tableId/waiting-list/:entryId`
- `POST /api/matches/start`
- `POST /api/matches/:matchId/finish`
- `GET /api/dashboard/state`
- `GET /api/dashboard/leaderboard`
- `GET /api/dashboard/history`
