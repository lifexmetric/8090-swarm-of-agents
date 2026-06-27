package com.bank.accounts.controller;

import com.bank.accounts.model.Account;
import com.bank.accounts.model.Transaction;
import com.bank.accounts.service.AccountService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    // DTO records

    public record CreateAccountRequest(
            @NotBlank(message = "customerId is required") String customerId,
            String accountType,
            String currency,
            BigDecimal initialBalance
    ) {}

    public record TransactionRequest(
            @NotBlank(message = "type is required") String type,
            @NotNull(message = "amount is required") @Positive(message = "amount must be positive") BigDecimal amount,
            String currency,
            String description,
            String referenceId
    ) {}

    // Endpoints

    @GetMapping("/{id}")
    public ResponseEntity<Account> getAccount(@PathVariable String id) {
        Account account = accountService.getAccount(id);
        return ResponseEntity.ok(account);
    }

    @GetMapping("/{id}/balance")
    public ResponseEntity<Map<String, Object>> getBalance(@PathVariable String id) {
        Map<String, Object> balance = accountService.getBalance(id);
        return ResponseEntity.ok(balance);
    }

    @PostMapping
    public ResponseEntity<Account> createAccount(@Valid @RequestBody CreateAccountRequest request) {
        Account account = accountService.createAccount(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(account);
    }

    @PostMapping("/{id}/transactions")
    public ResponseEntity<Transaction> recordTransaction(
            @PathVariable String id,
            @Valid @RequestBody TransactionRequest request) {
        Transaction transaction = accountService.recordTransaction(id, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(transaction);
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "service", "accounts-service"
        ));
    }
}
