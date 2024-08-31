# Tasque ⚡️
A Serverless Scheduler and Queue system built on top of cloudflare workers, D1 and Durable Objects to handle scale and schedule/queue millions of job without any hard limit.

## Requirements
- Cloudflare Worker Paid Plan to access durable objects

---
## Easy to setup
Its very easy to srtup as everything is on cloudflare so no need to manage anything or spinning up any servers


#### Clone Repository
``` bash
git clone https://github.com/hackerrahul/Serverless-Scheduler-and-Queue.git
```

#### Install Dependencies (use npm, yarn, pnpm, bun)
``` bash
yarn install
```

#### Create D1 Database
you can follow the steps here as well - [Create D1 Database](https://developers.cloudflare.com/d1/get-started/#2-create-a-database)

you can name database anything but make sure to remove the db from package.json and wrangler.toml file.

``` bash
npx wrangler d1 create scheduler_db
```
This will output database ID, that you have to replace in your wrangler.toml file.

#### Make migrations
``` bash
yarn run make:migration
```

#### Run migrations

###### Local
``` bash
yarn run migration:local
```

###### Production DB
``` bash
yarn run migration:remote
```

#### Deploy to production
``` bash
yarn run deploy
```

Well Done, your scheduler is now live 👍, you can easily view the scheduled tasks and queued jobs in drizzle studio.

To run Drizzle Studio and connect it to live account, you need to generate these things-

- To get accountId go to Workers & Pages -> Overview -> copy Account ID from the right sidebar.
- To get databaseId open D1 database you want to connect to and copy Database ID.
- To get token go to My profile -> API Tokens and create token with D1 edit permissions.

<<<<<<< Updated upstream
Now rename your .env.example file to .env and paste these details and paste the value of each key.
=======
Now Remove your .env.example file to .env and paste these details and paste the value for each key.
>>>>>>> Stashed changes

Now to start the studio you can run this command from your terminal
``` bash
yarn run studio
```
This will give you a url to open the studio in your terminal, or you can open from here :
- https://local.drizzle.studio

---
#### Documentation
you can find the documentation here for all the API.

[Read the documentation](https://documenter.getpostman.com/view/5063624/2sAXjKbYYa)

You can set the environment variables for the postman collection and give your worker url with https and without tailing slash.

Example Below:

> https://scheduler.YOUR_USERNAME.workers.dev

---

#### Contributions
you can follow [Contribution guidelines for this project](CONTRIBUTING.md)

Star ⭐️ the project if you like it!