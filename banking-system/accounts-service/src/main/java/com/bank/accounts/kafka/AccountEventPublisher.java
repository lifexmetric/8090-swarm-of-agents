package com.bank.accounts.kafka;

import com.bank.accounts.model.Account;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class AccountEventPublisher {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${kafka.topics.account-updated}")
    private String topic;

    public void publishAccountUpdated(Account account, String eventType) {
        Map<String, Object> event = new HashMap<>();
        event.put("event_type", eventType);
        event.put("account_id", account.getId());
        event.put("customer_id", account.getCustomerId());
        event.put("new_balance", account.getBalance());
        event.put("currency", account.getCurrency());
        event.put("timestamp", OffsetDateTime.now().toString());

        CompletableFuture<SendResult<String, Object>> future =
                kafkaTemplate.send(topic, account.getId(), event);

        future.whenComplete((result, ex) -> {
            if (ex == null) {
                log.info("Published account event [{}] for account {} to topic {} partition {} offset {}",
                        eventType,
                        account.getId(),
                        result.getRecordMetadata().topic(),
                        result.getRecordMetadata().partition(),
                        result.getRecordMetadata().offset());
            } else {
                log.error("Failed to publish account event [{}] for account {}: {}",
                        eventType, account.getId(), ex.getMessage(), ex);
            }
        });
    }
}
