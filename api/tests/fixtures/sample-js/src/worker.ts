export async function enqueue(topic: string, payload: unknown) {
  console.log("queue", topic, payload);
}
