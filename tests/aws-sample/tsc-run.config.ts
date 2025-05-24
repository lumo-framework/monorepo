export default {
  projectName: 'example',
  provider: 'aws' as const,
  region: 'us-east-1',
  routes: 'src/routes',
  resources: {
    userTable: {
      type: 'dynamodb',
      partitionKey: 'id'
    }
  },
  events: {
    eventBus: 'default',
    subscribers: {
      'send-welcome-email': {
        events: ['user.created', 'user.verified']
      },
      'update-analytics': {
        events: ['user.created', 'order.completed']
      }
    }
  }
};