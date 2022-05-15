import { FastifyPluginAsync } from 'fastify';
import { userIsAdmin } from '../utils';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import fastifyCors from 'fastify-cors';
const helmet = require('fastify-helmet');

const expo = new Expo();

const menu: MenuItem[] = [
  {
    name: 'dboll',
    imageUrl:
      'https://varsego.se/storage/9CF65AC82138E32E661B64BD2862BFD04CAE48425DA05EA661F8026F32098D57/36f14f37e20d4263b0c3f7836953f22c/png/media/0e8300047b1d47d284a8e58281dea950/12947%20Delicatoboll%2050p.png',
  },
  {
    name: 'lasagne',
    imageUrl:
      'https://crockpot.se/wp-content/uploads/2020/02/Lasange_hem-640x480.jpg',
  },
];

const orders: Order[] = [
  { id: 0, orders: ['hej', 'felix', 'ketchup'], isDone: false },
];

const history: Order[] = [];

const subscriptions = new Map<number, Set<string>>();

class Counter {
  private orderNumber = 0;
  next() {
    if (this.orderNumber < 300) {
      this.orderNumber++;
    } else {
      this.orderNumber = 0;
    }
    return this.orderNumber;
  }

  resetFrom(from: number) {
    this.orderNumber = from - 1;
  }
}

const counter = new Counter();

const root: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.register(helmet, (instance) => {
    return {
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'form-action': ["'self'"],
          'img-src': ["'self'", 'data:', 'validator.swagger.io'],
          //@ts-ignore
          //'script-src': ["'self'"].concat(instance.swaggerCSP.script),
          //@ts-ignore
          //'style-src': ["'self'", 'https:'].concat(instance.swaggerCSP.style),
        },
      },
    };
  });
  fastify.register(fastifyCors, {
    origin: '*',
  });

  fastify.register(require('fastify-swagger'), {
    routePrefix: '/documentation',
    swagger: {
      info: {
        title: 'Dsek order API',
        description: 'Backend for our internal order system',
        version: '0.1.0',
      },
      host: 'dsek-order-app.herokuapp.com',
      schemes: ['https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        apiKey: {
          type: 'apiKey',
          name: 'apiKey',
          in: 'header',
        },
      },
    },
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    /*     uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    transformStaticCSP: (header) => header, */
    staticCSP: true,
    exposeRoute: true,
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

  fastify.get('/menu', async function (request, reply) {
    return menu;
  });
  fastify.get('/history', async function (request, reply) {
    //en historik
    return history;
  });

  fastify.post(
    '/menuItem',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
            },
            imageUrl: {
              type: 'string',
            },
          },
        },
      },
    },
    async function (request, reply) {
      if (await userIsAdmin(request.headers)) {
        const body = request.body as { name: string; imageUrl?: string };
        const names = menu.map((menuItem) => menuItem.name);
        if (names.includes(body.name)) {
          return reply.badRequest(
            `There is already a menu item with the name: ${body.name}`
          );
        } else {
          const menuItem: MenuItem = {
            name: body.name,
            imageUrl: body.imageUrl ?? '',
          };
          menu.push(menuItem);
          return menuItem;
        }
      }
      return reply.forbidden();
    }
  );

  fastify.delete(
    '/menuItem',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'imageUrl'],
          properties: {
            name: {
              type: 'string',
            },
          },
        },
      },
    },
    async function (request, reply) {
      if (await userIsAdmin(request.headers)) {
        const body = request.body as { name: string };
        const menuItem = menu.find((menuItem) => menuItem.name === body.name);
        if (menuItem) {
          menu.splice(menu.indexOf(menuItem), 1);
          return menuItem;
        } else {
          return reply.badRequest(
            `There is no menu item with the name: ${body.name}`
          );
        }
      }
      return reply.forbidden();
    }
  );

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
            id: {
              type: 'number',
            },
          },
        },
      },
    },
    async function (request, reply) {
      if (await userIsAdmin(request.headers)) {
        const body = request.body as { orders: string[]; id?: number };
        if (body.id !== undefined) {
          counter.resetFrom(body.id);
        }
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
            console.log(
              `Order #${body.id} is marked as done, attempting to send push notifications to: `,
              tokens
            );
            for (const token of tokens) {
              if (!Expo.isExpoPushToken(token)) {
                console.error(
                  `Push token ${token} is not a valid Expo push token`
                );
                continue;
              }
              const message = {
                to: token,
                title: 'Din mat är klar 🍽️',
                body: `Nu kan du gå och hämta beställning #${body.id}`,
              };
              messages.push(message);
            }
            if (messages.length > 0) {
              const chunks = expo.chunkPushNotifications(messages);
              for (const chunk of chunks) {
                try {
                  const ticketChunk = await expo.sendPushNotificationsAsync(
                    chunk
                  );
                  console.log(ticketChunk);
                } catch (error) {
                  console.error(error);
                }
              }
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

  fastify.post(
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
          tokens.add(body.token);
          subscriptions.set(body.id, tokens);
        } else {
          subscriptions.set(body.id, new Set([body.token]));
        }
        console.log(
          `In the map, the array with id ${body.id} now contains ${Array.from(
            subscriptions.get(body.id) || []
          )}`
        );
        return {
          message: `Successfully subscribed to order #${body.id} with token ${body.token}`,
        };
      } else {
        return reply.badRequest(`${body.token} is not a valid expo token`);
      }
    }
  );

  fastify.post(
    '/order/unsubscribe',
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
      const tokens = subscriptions.get(body.id);
      if (tokens) {
        if (tokens.delete(body.token)) {
          console.log(
            `In the map, the array with id ${body.id} now contains ${Array.from(
              subscriptions.get(body.id) || []
            )}`
          );
          return { message: `Successfully removed token ${body.token}` };
        } else {
          return reply.badRequest(
            `${Array.from(tokens)} does not contain ${body.token}`
          );
        }
      } else {
        return reply.badRequest(`${body.id} does not have any tokens`);
      }
    }
  );

  fastify.delete(
    '/order',
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
        const orderToDelete = orders.find((order) => order.id === body.id);
        if (orderToDelete) {
          orders.splice(orders.indexOf(orderToDelete), 1);
          history.push(orderToDelete);
          return orderToDelete;
        }
        return reply.badRequest(`There is no order with the id ${body.id}`);
      }
      return reply.forbidden();
    }
  );
};

export default root;
