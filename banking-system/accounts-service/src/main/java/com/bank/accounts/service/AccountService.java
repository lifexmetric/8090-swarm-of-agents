package com.bank.accounts.service;

import com.bank.accounts.controller.AccountController.CreateAccountRequest;
import com.bank.accounts.controller.AccountController.TransactionRequest;
import com.bank.accounts.kafka.AccountEventPublisher;
import com.bank.accounts.model.Account;
import com.bank.accounts.model.Transaction;
import com.bank.accounts.repository.AccountRepository;
import com.bank.accounts.repository.TransactionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class AccountService {

    private final AccountRepository accountRepository;
    private final TransactionRepository transactionRepository;
    private final AccountEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Account getAccount(String id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Account not found: " + id));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getBalance(String id) {
        Account account = getAccount(id);
        return Map.of(
                "account_id", account.getId(),
                "balance", account.getBalance(),
                "currency", account.getCurrency(),
                "last_updated", account.getUpdatedAt() != null
                        ? account.getUpdatedAt().toString()
                        : OffsetDateTime.now().toString()
        );
    }

    public Account createAccount(CreateAccountRequest request) {
        Account account = new Account();
        account.setId(UUID.randomUUID().toString());
        account.setCustomerId(request.customerId());
        account.setAccountType(request.accountType() != null ? request.accountType() : "CHECKING");
        account.setCurrency(request.currency() != null ? request.currency() : "USD");
        account.setBalance(request.initialBalance() != null ? request.initialBalance() : BigDecimal.ZERO);
        account.setStatus("ACTIVE");
        account.setCreatedAt(OffsetDateTime.now());
        account.setUpdatedAt(OffsetDateTime.now());

        Account saved = accountRepository.save(account);
        log.info("Created account {} for customer {}", saved.getId(), saved.getCustomerId());
        return saved;
    }

    public Transaction recordTransaction(String accountId, TransactionRequest request) {
        Account account = getAccount(accountId);

        String type = request.type();
        BigDecimal amount = request.amount();

        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction amount must be positive");
        }

        if (!"DEBIT".equals(type) && !"CREDIT".equals(type)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transaction type must be DEBIT or CREDIT");
        }

        if ("DEBIT".equals(type)) {
            if (account.getBalance().compareTo(amount) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Insufficient funds: balance " + account.getBalance() + ", requested " + amount);
            }
            account.setBalance(account.getBalance().subtract(amount));
        } else {
            account.setBalance(account.getBalance().add(amount));
        }

        account.setUpdatedAt(OffsetDateTime.now());
        accountRepository.save(account);

        Transaction transaction = new Transaction();
        transaction.setAccountId(accountId);
        transaction.setType(type);
        transaction.setAmount(amount);
        transaction.setCurrency(request.currency() != null ? request.currency() : account.getCurrency());
        transaction.setDescription(request.description());
        transaction.setReferenceId(request.referenceId());
        transaction.setCreatedAt(OffsetDateTime.now());

        Transaction saved = transactionRepository.save(transaction);

        log.info("Recorded {} transaction {} on account {} for amount {}",
                type, saved.getId(), accountId, amount);

        eventPublisher.publishAccountUpdated(account, "ACCOUNT_BALANCE_UPDATED");

        return saved;
    }
}
