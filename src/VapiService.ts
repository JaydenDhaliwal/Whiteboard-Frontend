import Vapi from '@vapi-ai/web';
import { VapiStatus, VapiMessage } from './types';

export class VapiService {
  private vapi: Vapi;
  private status: VapiStatus = 'idle';
  private onStatusChange: (status: VapiStatus) => void;
  private onMessage: (message: VapiMessage) => void;
  private callId: string | null = null;

  constructor(
    apiKey: string,
    onStatusChange: (status: VapiStatus) => void,
    onMessage: (message: VapiMessage) => void
  ) {
    this.vapi = new Vapi(apiKey);
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;
    this.setupListeners();
    console.log("VapiService initialized.");
  }

  private updateStatus(status: VapiStatus) {
    this.status = status;
    this.onStatusChange(status);
    console.log(`VAPI status changed to: ${status}`);
  }

  private setupListeners() {
    this.vapi.on('call-start', () => {
      console.log('VAPI call started.');
      this.updateStatus('connected');
      this.onMessage({ type: 'status', text: 'AI assistant connected.' });
    });

    this.vapi.on('call-end', () => {
      console.log('VAPI call ended.');
      this.callId = null;
      this.updateStatus('idle');
      this.onMessage({ type: 'status', text: 'Conversation ended.' });
    });

    this.vapi.on('message', (message) => {
      // Avoid logging every single message event unless debugging
      // console.log("VAPI message received:", message);
      this.onMessage(message);
    });

    this.vapi.on('error', (e) => {
      console.error('❌ Vapi Error:', e);
      this.updateStatus('error');
      this.onMessage({ type: 'error', text: 'An error occurred during the VAPI call.' });
    });
  }

  public async startCall(assistantId: string, context?: string) {
    if (this.isCallActive()) {
      console.warn("A VAPI call is already active. Cannot start a new one.");
      return;
    }
    
    this.updateStatus('connecting');
    console.log(`Attempting to start VAPI call with assistant ${assistantId}...`);
    this.onMessage({ type: 'status', text: 'Connecting to AI assistant...' });
    
    const assistantOverrides = {
        firstMessage: context ?? "Hello, how can I help you today?",
    };

    try {
      const call = await this.vapi.start(assistantId, assistantOverrides);
      if (call) {
          this.callId = call.id;
          console.log(`VAPI call initiated with Call ID: ${this.callId}`);
      }
    } catch (error) {
      console.error("❌ Failed to start VAPI call:", error);
      this.updateStatus('error');
    }
  }

  public stopCall() {
    if (!this.isCallActive()) {
      console.warn("No active VAPI call to stop.");
      return;
    }
    console.log("Stopping VAPI call...");
    this.vapi.stop();
  }

  public updateContext(context: string) {
    if (this.status !== 'connected') {
      console.warn('Vapi is not connected. Cannot update context. Status:', this.status);
      return;
    }
    console.log("🔄 Sending real-time whiteboard update to VAPI...");
    this.vapi.send({
        type: 'add-message',
        message: {
            role: 'system',
            content: `**New Whiteboard Content Detected**\n\nThe user has updated the whiteboard. Here is the new analysis. Use this to inform your next response.\n\n${context}`,
        },
    });
    console.log("✅ Real-time update sent.");
  }

  public isCallActive(): boolean {
    return this.status === 'connected' || this.status === 'connecting';
  }

  public isConnected(): boolean {
    return this.status === 'connected';
  }
} 