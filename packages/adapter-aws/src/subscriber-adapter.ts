import type {EventBridgeEvent} from 'aws-lambda';
import type {events} from '@tsc-run/core';

export const subscriberAdapter = (handler: (message: events.Event) => Promise<void>) => {
    return async (event: EventBridgeEvent<string, any>): Promise<void> => {
        try {
            const message = parseMessage(event);
            await handler(message);
        } catch (error) {
            console.error('Error processing EventBridge event:', error);
            throw error; // This will cause the event to be retried if configured
        }
    };
};

function parseMessage(event: EventBridgeEvent<string, any>): events.Event {
    try {
        return {
            type: event['detail-type'], // EventBridge uses 'detail-type' for event type
            data: event.detail // EventBridge uses 'detail' for event data
        };
    } catch (error) {
        throw new Error(`Failed to parse EventBridge event: ${error}`);
    }
}