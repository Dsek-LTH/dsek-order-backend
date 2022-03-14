import { FastifyPluginAsync } from 'fastify';
import { userIsAdmin } from '../utils';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import fastifyCors from 'fastify-cors';

//import { getUser, userIsAdmin } from '../utils';

const expo = new Expo();

const orders: Order[] = [
  { id: 0, orders: ['hej', 'felix', 'ketchup'], isDone: false },
];

const subscriptions = new Map<number, string[]>();

class Counter {
  private orderNumber = -1;
  next() {
    if (this.orderNumber < 300) {
      this.orderNumber++;
    } else {
      this.orderNumber = 0;
    }
    return this.orderNumber;
  }
}

const counter = new Counter();

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.register(fastifyCors, {
    origin: '*',
  });

  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (req, body: string, done) {
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    }
  );

  fastify.get('/orders', async function (request, reply) {
    return orders;
  });

  fastify.post(
    '/order',
    {
      schema: {
        body: {
          type: 'object',
          required: ['orders'],
          properties: {
            orders: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    async function (request, reply) {
      if (await userIsAdmin(request.headers)) {
        const body = request.body as { orders: string[] };
        const newOrder: Order = {
          id: counter.next(),
          orders: body.orders,
          isDone: false,
        };
        orders.push(newOrder);
        return newOrder;
      }
      return reply.forbidden();
    }
  );

  fastify.put(
    '/order/done',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'number',
            },
          },
        },
      },
    },
    async function (request, reply) {
      if (await userIsAdmin(request.headers)) {
        const body = request.body as { id: number };
        const orderToMarkDone = orders.find((order) => order.id === body.id);
        if (orderToMarkDone) {
          orderToMarkDone.isDone = true;
          const tokens = subscriptions.get(body.id);
          if (tokens) {
            const messages: ExpoPushMessage[] = [];
            for (const token in tokens) {
              if (!Expo.isExpoPushToken(token)) {
                console.error(
                  `Push token ${token} is not a valid Expo push token`
                );
                continue;
              }
              messages.push({
                to: token,
                sound: 'default',
                title: 'Din mat är klar 🍽️',
                body: `Nu kan du gå och hämta beställning #${body.id}`,
              });
            }
            if (messages.length > 0) {
              expo.chunkPushNotifications(messages);
            }
            subscriptions.delete(body.id);
          }
          return orderToMarkDone;
        }
        return reply.badRequest(`There is no order with the id ${body.id}`);
      }
      return reply.forbidden();
    }
  );

  fastify.put(
    '/order/subscribe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'token'],
          properties: {
            id: {
              type: 'number',
            },
            token: {
              type: 'string',
            },
          },
        },
      },
    },
    async function (request, reply) {
      const body = request.body as { id: number; token: string };
      if (Expo.isExpoPushToken(body.token)) {
        const tokens = subscriptions.get(body.id);
        if (tokens) {
          tokens.push(body.token);
          subscriptions.set(body.id, tokens);
        } else {
          subscriptions.set(body.id, [body.token]);
        }
        return {
          message: `Successfully subscribed to order #${body.id} with token ${body.token}`,
        };
      } else {
        return reply.badRequest(`${body.token} is not a valid expo token`);
      }
    }
  );
};

export default root;
