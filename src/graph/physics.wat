(module
  (type (;0;) (func (param f32) (result f32)))
  (type (;1;) (func (param i32 i32 i32) (result i32)))
  (type (;2;) (func (param i32 i32 i32)))
  (type (;3;) (func (param i32 i32 f32)))
  (type (;4;) (func (param i32 i32 i32 i32 i32 i32 f32)))
  (type (;5;) (func (param i32 i32 i32 i32 f32 f32 i32 i32 f32 f32 f32 f32)))
  (type (;6;) (func (param i32 i32 i32 f32 f32 f32)))
  (type (;7;) (func (param i32 i32 i32 f32 f32 f32 f32 f32 f32 f32)))
  (func (;0;) (type 1) (param i32 i32 i32) (result i32)
    block  ;; label = @1
      local.get 2
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 2
      i32.const 1
      i32.add
      local.set 2
      loop  ;; label = @2
        local.get 0
        local.get 1
        i32.store8
        local.get 0
        i32.const 1
        i32.add
        local.set 0
        local.get 2
        i32.const -1
        i32.add
        local.tee 2
        i32.const 1
        i32.gt_s
        br_if 0 (;@2;)
      end
    end
    local.get 0)
  (func (;1;) (type 2) (param i32 i32 i32)
    (local i32 f32 i32 i32)
    block  ;; label = @1
      local.get 1
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 0
      i32.const 16
      i32.add
      local.set 5
      local.get 1
      local.set 6
      loop  ;; label = @2
        local.get 5
        i32.const 0
        i32.store
        local.get 5
        i32.const 20
        i32.add
        local.set 5
        local.get 6
        i32.const -1
        i32.add
        local.tee 6
        br_if 0 (;@2;)
      end
    end
    block  ;; label = @1
      local.get 2
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 1
      i32.const 20
      i32.mul
      local.tee 6
      local.set 5
      local.get 2
      local.set 1
      loop  ;; label = @2
        local.get 0
        local.get 5
        i32.load
        i32.const 20
        i32.mul
        i32.add
        local.tee 3
        local.get 3
        f32.load offset=16
        f32.const 0x1p+0 (;=1;)
        f32.add
        f32.store offset=16
        local.get 0
        local.get 5
        i32.const 4
        i32.add
        i32.load
        i32.const 20
        i32.mul
        i32.add
        local.tee 3
        local.get 3
        f32.load offset=16
        f32.const 0x1p+0 (;=1;)
        f32.add
        f32.store offset=16
        local.get 5
        i32.const 12
        i32.add
        local.set 5
        local.get 1
        i32.const -1
        i32.add
        local.tee 1
        br_if 0 (;@2;)
      end
      local.get 2
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      loop  ;; label = @2
        local.get 6
        i32.const 8
        i32.add
        local.get 0
        local.get 6
        i32.load
        i32.const 20
        i32.mul
        i32.add
        f32.load offset=16
        local.tee 4
        local.get 4
        local.get 0
        local.get 6
        i32.const 4
        i32.add
        i32.load
        i32.const 20
        i32.mul
        i32.add
        f32.load offset=16
        f32.add
        f32.div
        f32.store
        local.get 6
        i32.const 12
        i32.add
        local.set 6
        local.get 2
        i32.const -1
        i32.add
        local.tee 2
        br_if 0 (;@2;)
      end
    end)
  (func (;2;) (type 3) (param i32 i32 f32)
    (local i32 f32 f32)
    block  ;; label = @1
      local.get 1
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      loop  ;; label = @2
        local.get 0
        i32.const 8
        i32.add
        local.tee 3
        local.get 3
        f32.load
        local.get 2
        f32.mul
        local.tee 4
        f32.store
        local.get 0
        i32.const 12
        i32.add
        local.tee 3
        local.get 3
        f32.load
        local.get 2
        f32.mul
        local.tee 5
        f32.store
        local.get 0
        local.get 4
        local.get 0
        f32.load
        f32.add
        f32.store
        local.get 0
        i32.const 4
        i32.add
        local.tee 3
        local.get 5
        local.get 3
        f32.load
        f32.add
        f32.store
        local.get 0
        i32.const 20
        i32.add
        local.set 0
        local.get 1
        i32.const -1
        i32.add
        local.tee 1
        br_if 0 (;@2;)
      end
    end)
  (func (;3;) (type 4) (param i32 i32 i32 i32 i32 i32 f32)
    (local f32 f32 f32 f32 f32 i32 f32 f32 i32 i32 i32)
    block  ;; label = @1
      local.get 2
      local.get 4
      local.get 1
      i32.mul
      local.get 5
      i32.add
      local.tee 12
      i32.const 4
      i32.shl
      i32.add
      i32.load offset=8
      local.tee 17
      i32.eqz
      br_if 0 (;@1;)
      local.get 0
      i32.const 24
      i32.add
      local.set 15
      local.get 0
      i32.const 16
      i32.add
      local.set 16
      block  ;; label = @2
        block  ;; label = @3
          loop  ;; label = @4
            local.get 6
            local.get 6
            f32.mul
            local.get 15
            f32.load
            f32.div
            local.tee 14
            local.get 2
            local.get 12
            i32.const 4
            i32.shl
            i32.add
            local.tee 12
            f32.load
            local.get 17
            f32.convert_i32_s
            local.tee 7
            f32.div
            local.get 3
            f32.load
            local.tee 8
            f32.sub
            local.tee 9
            local.get 9
            f32.mul
            local.get 12
            f32.load offset=4
            local.get 7
            f32.div
            local.get 3
            i32.const 4
            i32.add
            f32.load
            local.tee 10
            f32.sub
            local.tee 11
            local.get 11
            f32.mul
            f32.add
            local.tee 13
            f32.ge
            local.get 14
            local.get 14
            f32.ne
            local.get 13
            local.get 13
            f32.ne
            i32.or
            i32.or
            i32.eqz
            br_if 1 (;@3;)
            local.get 16
            i32.load
            local.tee 12
            local.get 1
            i32.le_s
            br_if 2 (;@2;)
            local.get 0
            local.get 1
            i32.const 1
            i32.shl
            local.tee 12
            local.get 2
            local.get 1
            local.get 12
            i32.mul
            i32.const 5
            i32.shl
            i32.sub
            local.tee 2
            local.get 3
            local.get 4
            i32.const 1
            i32.shl
            local.tee 1
            local.get 5
            i32.const 1
            i32.shl
            local.tee 5
            local.get 6
            f32.const 0x1p-1 (;=0.5;)
            f32.mul
            local.tee 6
            call 3
            local.get 0
            local.get 12
            local.get 2
            local.get 3
            local.get 1
            i32.const 1
            i32.or
            local.tee 4
            local.get 5
            local.get 6
            call 3
            local.get 0
            local.get 12
            local.get 2
            local.get 3
            local.get 1
            local.get 5
            i32.const 1
            i32.or
            local.tee 5
            local.get 6
            call 3
            local.get 12
            local.set 1
            local.get 2
            local.get 4
            local.get 12
            i32.mul
            local.get 5
            i32.add
            local.tee 12
            i32.const 4
            i32.shl
            i32.add
            i32.load offset=8
            local.tee 17
            br_if 0 (;@4;)
            br 3 (;@1;)
          end
        end
        f32.const 0x1p-1 (;=0.5;)
        local.get 11
        local.get 11
        f32.const 0x0p+0 (;=0;)
        f32.eq
        local.tee 2
        select
        local.set 8
        f32.const 0x1p-1 (;=0.5;)
        local.get 9
        local.get 9
        f32.const 0x0p+0 (;=0;)
        f32.eq
        local.tee 12
        select
        local.set 10
        block  ;; label = @3
          local.get 13
          f32.const 0x1p-2 (;=0.25;)
          f32.add
          local.get 13
          local.get 12
          select
          local.tee 6
          f32.const 0x1p-2 (;=0.25;)
          f32.add
          local.get 6
          local.get 2
          select
          local.tee 6
          f32.const 0x1.ep+4 (;=30;)
          f32.ge
          local.get 6
          local.get 6
          f32.ne
          i32.or
          br_if 0 (;@3;)
          local.get 6
          f32.const 0x1.ep+4 (;=30;)
          f32.mul
          f32.sqrt
          local.set 6
        end
        local.get 3
        local.get 3
        f32.load offset=8
        local.get 10
        local.get 0
        f32.load offset=20
        local.get 7
        f32.mul
        local.get 6
        f32.div
        local.tee 6
        f32.mul
        f32.add
        f32.store offset=8
        local.get 3
        local.get 3
        f32.load offset=12
        local.get 8
        local.get 6
        f32.mul
        f32.add
        f32.store offset=12
        return
      end
      local.get 0
      i32.load offset=12
      local.get 12
      local.get 4
      i32.mul
      local.get 5
      i32.add
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee 1
      i32.const -1
      i32.eq
      br_if 0 (;@1;)
      local.get 0
      i32.load offset=8
      local.set 5
      local.get 0
      i32.load
      local.set 4
      local.get 3
      i32.const 8
      i32.add
      local.set 17
      local.get 3
      i32.const 12
      i32.add
      local.set 15
      loop  ;; label = @2
        local.get 4
        local.get 1
        i32.const 20
        i32.mul
        i32.add
        local.tee 2
        i32.const 4
        i32.add
        local.set 12
        block  ;; label = @3
          loop  ;; label = @4
            local.get 2
            local.get 3
            i32.eq
            br_if 1 (;@3;)
            local.get 2
            f32.load
            local.get 8
            f32.sub
            local.tee 6
            local.get 6
            f32.mul
            local.get 12
            f32.load
            local.get 10
            f32.sub
            local.tee 13
            local.get 13
            f32.mul
            f32.add
            local.tee 14
            f32.const 0x0p+0 (;=0;)
            f32.eq
            br_if 0 (;@4;)
          end
          local.get 17
          local.get 17
          f32.load
          local.get 6
          local.get 0
          i32.const 20
          i32.add
          f32.load
          local.get 14
          f32.div
          local.tee 14
          f32.mul
          f32.add
          f32.store
          local.get 15
          local.get 13
          local.get 14
          f32.mul
          local.get 15
          f32.load
          f32.add
          f32.store
        end
        local.get 5
        local.get 1
        i32.const 2
        i32.shl
        i32.add
        i32.load
        local.tee 1
        i32.const -1
        i32.ne
        br_if 0 (;@2;)
      end
    end)
  (func (;4;) (type 5) (param i32 i32 i32 i32 f32 f32 i32 i32 f32 f32 f32 f32)
    (local f32 i32 f32 i32 i32)
    block  ;; label = @1
      local.get 2
      local.get 6
      local.get 1
      i32.mul
      local.get 7
      i32.add
      i32.const 4
      i32.shl
      i32.add
      i32.load offset=8
      i32.eqz
      br_if 0 (;@1;)
      local.get 0
      i32.const 32
      i32.add
      local.set 15
      local.get 0
      i32.const 16
      i32.add
      local.set 16
      loop  ;; label = @2
        local.get 5
        local.get 15
        f32.load
        local.tee 12
        local.get 12
        f32.add
        local.tee 12
        f32.sub
        local.get 11
        f32.gt
        br_if 1 (;@1;)
        local.get 12
        local.get 5
        f32.add
        local.get 9
        f32.lt
        br_if 1 (;@1;)
        local.get 12
        local.get 4
        f32.add
        local.get 8
        f32.lt
        br_if 1 (;@1;)
        local.get 4
        local.get 12
        f32.sub
        local.get 10
        f32.gt
        br_if 1 (;@1;)
        block  ;; label = @3
          local.get 16
          i32.load
          local.tee 13
          local.get 1
          i32.le_s
          br_if 0 (;@3;)
          local.get 0
          local.get 1
          i32.const 1
          i32.shl
          local.tee 13
          local.get 2
          local.get 1
          local.get 13
          i32.mul
          i32.const 5
          i32.shl
          i32.sub
          local.tee 2
          local.get 3
          local.get 4
          local.get 5
          local.get 6
          i32.const 1
          i32.shl
          local.tee 1
          local.get 7
          i32.const 1
          i32.shl
          local.tee 7
          local.get 8
          local.get 9
          local.get 8
          local.get 10
          f32.add
          f32.const 0x1p-1 (;=0.5;)
          f32.mul
          local.tee 12
          local.get 9
          local.get 11
          f32.add
          f32.const 0x1p-1 (;=0.5;)
          f32.mul
          local.tee 14
          call 4
          local.get 0
          local.get 13
          local.get 2
          local.get 3
          local.get 4
          local.get 5
          local.get 1
          i32.const 1
          i32.or
          local.tee 6
          local.get 7
          local.get 12
          local.get 9
          local.get 10
          local.get 14
          call 4
          local.get 0
          local.get 13
          local.get 2
          local.get 3
          local.get 4
          local.get 5
          local.get 1
          local.get 7
          i32.const 1
          i32.or
          local.tee 7
          local.get 8
          local.get 14
          local.get 12
          local.get 11
          call 4
          local.get 14
          local.set 9
          local.get 12
          local.set 8
          local.get 13
          local.set 1
          local.get 2
          local.get 6
          local.get 13
          i32.mul
          local.get 7
          i32.add
          i32.const 4
          i32.shl
          i32.add
          i32.load offset=8
          br_if 1 (;@2;)
          br 2 (;@1;)
        end
      end
      local.get 0
      i32.load offset=12
      local.get 13
      local.get 6
      i32.mul
      local.get 7
      i32.add
      i32.const 2
      i32.shl
      i32.add
      i32.load
      local.tee 13
      i32.const -1
      i32.eq
      br_if 0 (;@1;)
      local.get 12
      local.get 12
      f32.mul
      local.set 8
      local.get 0
      i32.load offset=8
      local.set 1
      local.get 0
      i32.load
      local.set 7
      local.get 0
      i32.const 28
      i32.add
      local.set 6
      loop  ;; label = @2
        local.get 13
        i32.const 20
        i32.mul
        local.set 2
        local.get 1
        local.get 13
        i32.const 2
        i32.shl
        i32.add
        i32.load
        local.set 13
        block  ;; label = @3
          local.get 7
          local.get 2
          i32.add
          local.tee 2
          local.get 3
          i32.le_s
          br_if 0 (;@3;)
          local.get 4
          local.get 2
          f32.load
          f32.sub
          local.get 2
          f32.load offset=8
          f32.sub
          local.tee 14
          local.get 14
          f32.mul
          local.get 5
          local.get 2
          f32.load offset=4
          f32.sub
          local.get 2
          f32.load offset=12
          f32.sub
          local.tee 11
          local.get 11
          f32.mul
          f32.add
          local.tee 9
          local.get 8
          f32.ge
          local.get 9
          local.get 9
          f32.ne
          local.get 8
          local.get 8
          f32.ne
          i32.or
          i32.or
          br_if 0 (;@3;)
          local.get 9
          f32.const 0x0p+0 (;=0;)
          f32.gt
          i32.eqz
          br_if 0 (;@3;)
          local.get 3
          i32.const 8
          i32.add
          local.tee 0
          local.get 0
          f32.load
          local.get 14
          local.get 6
          f32.load
          local.get 12
          local.get 9
          f32.sqrt
          local.tee 9
          f32.sub
          local.get 9
          f32.div
          f32.mul
          f32.const 0x1p-1 (;=0.5;)
          f32.mul
          local.tee 9
          f32.mul
          local.tee 14
          f32.add
          f32.store
          local.get 3
          i32.const 12
          i32.add
          local.tee 0
          local.get 0
          f32.load
          local.get 11
          local.get 9
          f32.mul
          local.tee 9
          f32.add
          f32.store
          local.get 2
          i32.const 8
          i32.add
          local.tee 0
          local.get 0
          f32.load
          local.get 14
          f32.sub
          f32.store
          local.get 2
          i32.const 12
          i32.add
          local.tee 2
          local.get 2
          f32.load
          local.get 9
          f32.sub
          f32.store
        end
        local.get 13
        i32.const -1
        i32.ne
        br_if 0 (;@2;)
      end
    end)
  (func (;5;) (type 6) (param i32 i32 i32 f32 f32 f32)
    (local i32 f32 f32 f32 i32 i32 i32 i32 i32 f32 f32 f32 f32 i32 i32 i32 i32 i32 i32 i32)
    block  ;; label = @1
      local.get 1
      i32.const 2
      i32.lt_s
      br_if 0 (;@1;)
      i32.const 1
      local.set 14
      loop  ;; label = @2
        local.get 14
        local.tee 24
        i32.const 1
        i32.shl
        local.set 14
        local.get 24
        local.get 24
        i32.mul
        local.get 1
        i32.lt_s
        br_if 0 (;@2;)
      end
      local.get 24
      i32.const 1
      i32.shr_s
      local.tee 20
      local.get 20
      i32.mul
      local.tee 12
      i32.const 2
      i32.shl
      local.get 2
      i32.const 12
      i32.mul
      local.get 1
      i32.const 20
      i32.mul
      local.tee 21
      i32.add
      local.tee 25
      local.get 1
      i32.const 2
      i32.shl
      local.tee 24
      i32.add
      local.tee 22
      i32.add
      local.set 6
      block  ;; label = @2
        local.get 1
        i32.const 1
        i32.lt_s
        br_if 0 (;@2;)
        local.get 25
        i32.const 255
        local.get 24
        call 0
        drop
      end
      local.get 6
      i32.const 36
      i32.add
      local.set 19
      block  ;; label = @2
        local.get 12
        i32.eqz
        br_if 0 (;@2;)
        local.get 19
        local.set 24
        local.get 22
        local.set 14
        i32.const 0
        local.set 2
        loop  ;; label = @3
          local.get 14
          i32.const -1
          i32.store
          local.get 24
          i64.const 0
          i64.store align=4
          local.get 24
          i32.const 8
          i32.add
          i32.const 0
          i32.store
          local.get 24
          i32.const 16
          i32.add
          local.set 24
          local.get 14
          i32.const 4
          i32.add
          local.set 14
          local.get 2
          i32.const 1
          i32.add
          local.tee 2
          local.get 12
          i32.lt_s
          br_if 0 (;@3;)
        end
      end
      local.get 6
      local.get 21
      i32.store offset=4
      local.get 6
      local.get 0
      i32.store
      local.get 6
      local.get 25
      i32.store offset=8
      local.get 6
      local.get 22
      i32.store offset=12
      local.get 6
      local.get 20
      i32.store offset=16
      local.get 6
      local.get 3
      f32.store offset=20
      local.get 6
      local.get 4
      local.get 4
      f32.mul
      f32.store offset=24
      local.get 6
      local.get 5
      f32.store offset=28
      local.get 6
      i32.const 1114636288
      i32.store offset=32
      local.get 0
      f32.load offset=4
      local.tee 17
      local.set 15
      local.get 0
      f32.load
      local.tee 18
      local.set 16
      local.get 17
      local.set 4
      local.get 18
      local.set 3
      block  ;; label = @2
        local.get 1
        i32.const 1
        i32.eq
        br_if 0 (;@2;)
        local.get 17
        local.set 15
        local.get 18
        local.set 16
        local.get 17
        local.set 4
        local.get 18
        local.set 3
        local.get 1
        i32.const 1
        i32.lt_s
        br_if 0 (;@2;)
        local.get 0
        i32.const 20
        i32.add
        local.set 24
        local.get 1
        i32.const -1
        i32.add
        local.set 14
        local.get 17
        local.set 15
        local.get 17
        local.set 4
        local.get 18
        local.set 16
        local.get 18
        local.set 3
        loop  ;; label = @3
          local.get 24
          i32.const 4
          i32.add
          f32.load
          local.tee 5
          local.get 15
          local.get 5
          local.get 15
          f32.gt
          select
          local.set 15
          local.get 5
          local.get 4
          local.get 5
          local.get 4
          f32.lt
          select
          local.set 4
          local.get 24
          f32.load
          local.tee 5
          local.get 16
          local.get 5
          local.get 16
          f32.gt
          select
          local.set 16
          local.get 5
          local.get 3
          local.get 5
          local.get 3
          f32.lt
          select
          local.set 3
          local.get 24
          i32.const 20
          i32.add
          local.set 24
          local.get 14
          i32.const -1
          i32.add
          local.tee 14
          br_if 0 (;@3;)
        end
      end
      local.get 15
      local.get 4
      f32.sub
      local.set 8
      local.get 16
      local.get 3
      f32.sub
      local.set 7
      block  ;; label = @2
        local.get 1
        i32.const 1
        i32.lt_s
        br_if 0 (;@2;)
        f32.const 0x1p+0 (;=1;)
        local.get 8
        local.get 20
        f32.convert_i32_s
        local.tee 9
        f32.div
        local.tee 5
        local.get 5
        f32.const 0x0p+0 (;=0;)
        f32.eq
        select
        local.set 5
        f32.const 0x1p+0 (;=1;)
        local.get 7
        local.get 9
        f32.div
        local.tee 9
        local.get 9
        f32.const 0x0p+0 (;=0;)
        f32.eq
        select
        local.set 9
        local.get 1
        i32.const -1
        i32.add
        local.set 23
        local.get 0
        i32.const 24
        i32.add
        local.set 2
        local.get 20
        i32.const -1
        i32.add
        local.set 12
        i32.const 0
        local.set 14
        loop  ;; label = @3
          local.get 25
          local.get 22
          local.get 18
          local.get 3
          f32.sub
          local.get 9
          f32.div
          f32.floor
          i32.trunc_f32_s
          local.tee 24
          local.get 12
          local.get 20
          local.get 24
          i32.gt_s
          select
          local.get 20
          i32.mul
          local.get 17
          local.get 4
          f32.sub
          local.get 5
          f32.div
          f32.floor
          i32.trunc_f32_s
          local.tee 24
          local.get 12
          local.get 20
          local.get 24
          i32.gt_s
          select
          i32.add
          local.tee 24
          i32.const 2
          i32.shl
          i32.add
          local.tee 21
          i32.load
          i32.store
          local.get 21
          local.get 14
          i32.store
          local.get 19
          local.get 24
          i32.const 4
          i32.shl
          i32.add
          local.tee 24
          local.get 18
          local.get 24
          f32.load
          f32.add
          f32.store
          local.get 24
          local.get 17
          local.get 24
          f32.load offset=4
          f32.add
          f32.store offset=4
          local.get 24
          local.get 24
          i32.load offset=8
          i32.const 1
          i32.add
          i32.store offset=8
          local.get 23
          local.get 14
          i32.eq
          br_if 1 (;@2;)
          local.get 14
          i32.const 1
          i32.add
          local.set 14
          local.get 25
          i32.const 4
          i32.add
          local.set 25
          local.get 2
          i32.const -4
          i32.add
          f32.load
          local.set 18
          local.get 2
          f32.load
          local.set 17
          local.get 2
          i32.const 20
          i32.add
          local.set 2
          br 0 (;@3;)
        end
      end
      block  ;; label = @2
        local.get 20
        i32.const 2
        i32.lt_s
        br_if 0 (;@2;)
        loop  ;; label = @3
          local.get 20
          local.tee 10
          local.get 10
          i32.mul
          i32.const 4
          i32.shl
          local.get 19
          local.tee 21
          i32.add
          local.set 19
          block  ;; label = @4
            local.get 10
            i32.const 1
            i32.shr_u
            local.tee 20
            i32.eqz
            br_if 0 (;@4;)
            local.get 10
            i32.const 5
            i32.shl
            local.set 13
            local.get 10
            i32.const 4
            i32.shl
            local.set 12
            local.get 20
            i32.const 4
            i32.shl
            local.set 11
            local.get 19
            i32.const 8
            i32.add
            local.set 22
            i32.const 0
            local.set 23
            loop  ;; label = @5
              local.get 21
              local.set 24
              local.get 22
              local.set 2
              local.get 20
              local.set 25
              loop  ;; label = @6
                local.get 2
                local.get 24
                local.get 12
                i32.add
                local.tee 14
                i32.const 8
                i32.add
                i32.load
                local.get 24
                i32.const 8
                i32.add
                i32.load
                i32.add
                local.get 24
                i32.const 24
                i32.add
                i32.load
                i32.add
                local.get 14
                i32.const 24
                i32.add
                i32.load
                i32.add
                i32.store
                local.get 2
                i32.const -8
                i32.add
                local.get 24
                f32.load
                local.get 14
                f32.load
                f32.add
                local.get 24
                i32.const 16
                i32.add
                f32.load
                f32.add
                local.get 14
                i32.const 16
                i32.add
                f32.load
                f32.add
                f32.store
                local.get 2
                i32.const -4
                i32.add
                local.get 24
                i32.const 4
                i32.add
                f32.load
                local.get 14
                i32.const 4
                i32.add
                f32.load
                f32.add
                local.get 24
                i32.const 20
                i32.add
                f32.load
                f32.add
                local.get 14
                i32.const 20
                i32.add
                f32.load
                f32.add
                f32.store
                local.get 24
                i32.const 32
                i32.add
                local.set 24
                local.get 2
                i32.const 16
                i32.add
                local.set 2
                local.get 25
                i32.const -1
                i32.add
                local.tee 25
                br_if 0 (;@6;)
              end
              local.get 21
              local.get 13
              i32.add
              local.set 21
              local.get 22
              local.get 11
              i32.add
              local.set 22
              local.get 23
              i32.const 1
              i32.add
              local.tee 23
              local.get 20
              i32.ne
              br_if 0 (;@5;)
            end
          end
          local.get 10
          i32.const 4
          i32.ge_u
          br_if 0 (;@3;)
        end
      end
      local.get 1
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 7
      local.get 8
      local.get 7
      local.get 8
      f32.gt
      select
      local.set 5
      local.get 1
      local.set 14
      local.get 0
      local.set 24
      loop  ;; label = @2
        local.get 6
        local.get 20
        local.get 19
        local.get 24
        i32.const 0
        i32.const 0
        local.get 5
        call 3
        local.get 24
        i32.const 20
        i32.add
        local.set 24
        local.get 14
        i32.const -1
        i32.add
        local.tee 14
        br_if 0 (;@2;)
      end
      local.get 1
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      loop  ;; label = @2
        local.get 6
        local.get 20
        local.get 19
        local.get 0
        local.get 0
        f32.load
        local.get 0
        i32.const 8
        i32.add
        f32.load
        f32.add
        local.get 0
        i32.const 4
        i32.add
        f32.load
        local.get 0
        i32.const 12
        i32.add
        f32.load
        f32.add
        i32.const 0
        i32.const 0
        local.get 3
        local.get 4
        local.get 16
        local.get 15
        call 4
        local.get 0
        i32.const 20
        i32.add
        local.set 0
        local.get 1
        i32.const -1
        i32.add
        local.tee 1
        br_if 0 (;@2;)
      end
    end)
  (func (;6;) (type 7) (param i32 i32 i32 f32 f32 f32 f32 f32 f32 f32)
    (local f32 i32 f32 i32 f32 f32 i32 i32)
    block  ;; label = @1
      local.get 1
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 3
      local.get 4
      f32.mul
      local.set 4
      local.get 0
      local.set 13
      local.get 1
      local.set 11
      loop  ;; label = @2
        local.get 13
        i32.const 8
        i32.add
        local.tee 16
        local.get 16
        f32.load
        local.get 4
        local.get 13
        f32.load
        f32.mul
        f32.sub
        f32.store
        local.get 13
        i32.const 12
        i32.add
        local.tee 16
        local.get 16
        f32.load
        local.get 4
        local.get 13
        i32.const 4
        i32.add
        f32.load
        f32.mul
        f32.sub
        f32.store
        local.get 13
        i32.const 20
        i32.add
        local.set 13
        local.get 11
        i32.const -1
        i32.add
        local.tee 11
        br_if 0 (;@2;)
      end
    end
    block  ;; label = @1
      local.get 2
      i32.const 1
      i32.lt_s
      br_if 0 (;@1;)
      local.get 1
      i32.const 20
      i32.mul
      local.set 16
      local.get 3
      local.get 5
      f32.mul
      local.set 10
      local.get 2
      local.set 17
      loop  ;; label = @2
        local.get 0
        local.get 16
        i32.const 4
        i32.add
        i32.load
        i32.const 20
        i32.mul
        i32.add
        local.tee 11
        local.get 11
        f32.load offset=8
        local.tee 5
        local.get 16
        i32.const 8
        i32.add
        f32.load
        local.tee 4
        f32.const 0x1.99999ap-4 (;=0.1;)
        local.get 5
        local.get 11
        f32.load
        f32.add
        local.get 0
        local.get 16
        i32.load
        i32.const 20
        i32.mul
        i32.add
        local.tee 13
        f32.load
        f32.sub
        local.get 13
        f32.load offset=8
        f32.sub
        local.tee 5
        local.get 5
        f32.const 0x0p+0 (;=0;)
        f32.eq
        select
        local.tee 5
        local.get 10
        local.get 5
        local.get 5
        f32.mul
        f32.const 0x1.99999ap-4 (;=0.1;)
        local.get 11
        f32.load offset=4
        local.get 11
        f32.load offset=12
        local.tee 12
        f32.add
        local.get 13
        f32.load offset=4
        f32.sub
        local.get 13
        f32.load offset=12
        f32.sub
        local.tee 5
        local.get 5
        f32.const 0x0p+0 (;=0;)
        f32.eq
        select
        local.tee 5
        local.get 5
        f32.mul
        f32.add
        f32.sqrt
        local.tee 14
        local.get 6
        f32.sub
        local.get 14
        f32.div
        f32.mul
        local.get 13
        local.get 11
        local.get 13
        f32.load offset=16
        local.get 11
        f32.load offset=16
        f32.lt
        select
        f32.load offset=16
        f32.div
        local.tee 14
        f32.mul
        local.tee 15
        f32.mul
        f32.sub
        f32.store offset=8
        local.get 11
        local.get 12
        local.get 4
        local.get 5
        local.get 14
        f32.mul
        local.tee 5
        f32.mul
        f32.sub
        f32.store offset=12
        local.get 13
        local.get 13
        f32.load offset=8
        f32.const 0x1p+0 (;=1;)
        local.get 4
        f32.sub
        local.tee 4
        local.get 15
        f32.mul
        f32.add
        f32.store offset=8
        local.get 13
        local.get 4
        local.get 5
        f32.mul
        local.get 13
        f32.load offset=12
        f32.add
        f32.store offset=12
        local.get 16
        i32.const 12
        i32.add
        local.set 16
        local.get 17
        i32.const -1
        i32.add
        local.tee 17
        br_if 0 (;@2;)
      end
    end
    local.get 0
    local.get 1
    local.get 2
    local.get 3
    local.get 7
    f32.mul
    local.get 8
    local.get 9
    call 5)
  (table (;0;) 0 funcref)
  (memory (;0;) 1)
  (export "memory" (memory 0))
  (export "memset" (func 0))
  (export "init" (func 1))
  (export "complete" (func 2))
  (export "visitCharge" (func 3))
  (export "visitCollide" (func 4))
  (export "manyBody" (func 5))
  (export "simulate" (func 6)))
