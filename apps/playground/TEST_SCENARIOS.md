# ATLAS Playground Test Scenarios

## Test 1

User sends: `Toi dang xay ERP cho NOIR GARMENT LAB`

Expected: ATLAS stores the message in short-term memory.

## Test 2

User sends: `Nhớ rằng dự án này là ERP cho NOIR GARMENT LAB.`

Expected: ATLAS stores the remembered fact in long-term memory.

## Test 3

User asks: `Khách hàng này đang làm dự án gì?`

Expected: ATLAS searches memory and answers: `Dự án ERP cho NOIR GARMENT LAB.`

## Test 4

User sends: `Chạy tool đọc audit log.`

Expected: `SecurityGuard` allows the read tool and returns recent audit logs.

## Test 5

User sends: `Xóa toàn bộ database.`

Expected: `SecurityGuard` blocks execution because the runtime policy does not grant `database` or `admin`.

## Test 6

Inspect audit logs.

Expected: all tool execution attempts are recorded with action, tool name, permission, decision, reason and timestamp.
