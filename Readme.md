# LiveSync

**Note**:- Ideally this should be used with Webhooks, but I do not have the access to those.

**LiveSync** is a sample **experimental** project of running [Liveblocks](liveblocks.io) client on cloudflare's [Workers](https://workers.cloudflare.com/) + [durable objects](https://developers.cloudflare.com/workers/learning/using-durable-objects/). it can be used in many scenarios, in this example we're syncing are todos near realtime in our postgres ([supabase](https://supabase.com/)) database.

## To Run It yourself locally or on workers.

**Requirements** :-

- You'll need a liveblocks account
- You'll need a supabase account

In your supabase database make sure you have a table configured called **todo**, here's the sql statement

    CREATE  TABLE todos (
      id SERIAL PRIMARY KEY,
      room_id VARCHAR NOT  NULL,
      todos JSONB,
      UNIQUE(room_id)
    );

**Clone** the repo & add a `.dev.vars` file on the root of the project. And add the following environment variables

- SUPABASE_URL
- SUPABASE_KEY
- LIVEBLOCKS_SECRET (secret from liveblocks's dashboard)

Now you can run `npm start` and the server should be up & running locally.

We'll use the [Liveblocks todo list example](https://liveblocks.io/examples/collaborative-todo-list/nextjs) for the client, you can install it using `npx create-liveblocks-app@latest --example nextjs-todo-list --api-key`, You'll need to make some changes to the project.

**\*In File** [/src/liveblocks.config.ts]\*
you'll need to replace the publicApiKey authentication with the following

    authEndpoint: async (roomId)  =>  {
     const res  =  await  fetch(`https://${SERVER_URL}/?roomId=${roomId}&userId=${userId}`);
     const AuthData  =  await  res.text();
     return  JSON.parse(AuthData);
     },

Please Note - You'll need to add the **_SERVER_URL_** & **_userId_** variables yourself. if ran locally the SERVER_URL is most likely gonna be http://localhost:8787 .

At Lastly in order to connect your worker to liveblocks. you'll need to manually visit this url `https://${SERVER_URL}/?roomId=${roomId}` where the server url is same as above & the roomId should also be the same as above.
