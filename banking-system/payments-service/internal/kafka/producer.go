package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/IBM/sarama"
)

var producer sarama.SyncProducer

func InitProducer() error {
	brokers := strings.Split(os.Getenv("KAFKA_BOOTSTRAP_SERVERS"), ",")
	if len(brokers) == 0 || brokers[0] == "" {
		brokers = []string{"localhost:9092"}
	}

	config := sarama.NewConfig()
	config.Producer.Return.Successes = true
	config.Producer.RequiredAcks = sarama.WaitForAll
	config.Producer.Retry.Max = 3

	var err error
	producer, err = sarama.NewSyncProducer(brokers, config)
	return err
}

func CloseProducer() {
	if producer != nil {
		producer.Close()
	}
}

func IsHealthy() error {
	if producer == nil {
		return fmt.Errorf("producer not initialized")
	}
	return nil
}

func PublishEvent(topic string, key string, payload interface{}) error {
	if producer == nil {
		return fmt.Errorf("kafka producer not initialized")
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(data),
	}

	partition, offset, err := producer.SendMessage(msg)
	if err != nil {
		log.Printf("Failed to publish to %s: %v", topic, err)
		return err
	}
	log.Printf("Published to %s (partition %d, offset %d)", topic, partition, offset)
	return nil
}
